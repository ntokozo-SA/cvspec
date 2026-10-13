import { getSupabaseAdmin } from '../middleware/auth.js'
import { loadProfile, loadSavedAnswers } from '../routes/profile.js'
import type {
  ApplicantProfile,
  JobSpecParsed,
  Recommendation,
  ResumeParsed,
  SavedAnswer,
} from '../types/index.js'
import { findLatestParsedResumeId } from './comparisonRunner.js'
import type { CandidateContext } from './openai.js'

export interface ApplicationRow {
  id: string
  title: string | null
  company: string | null
  job_spec_id: string
  resume_id: string | null
  comparison_id: string | null
  tailored_comparison_id: string | null
  tailored_recommendations: number[] | null
  cover_letter: string | null
}

export interface LoadedContext {
  application: ApplicationRow
  profile: ApplicantProfile
  bank: SavedAnswer[]
  context: CandidateContext
}

const APPLICATION_COLUMNS =
  'id, title, company, job_spec_id, resume_id, comparison_id, tailored_comparison_id, tailored_recommendations, cover_letter'

export async function loadApplicationRow(
  userId: string,
  applicationId: string,
): Promise<ApplicationRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('applications')
    .select(APPLICATION_COLUMNS)
    .eq('id', applicationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as ApplicationRow | null) ?? null
}

/** Everything the AI may use to write for this application: resume, job, profile, saved answers. */
export async function loadCandidateContext(
  userId: string,
  accountEmail: string | undefined,
  applicationId: string,
): Promise<LoadedContext | null> {
  const application = await loadApplicationRow(userId, applicationId)
  if (!application) return null

  const supabase = getSupabaseAdmin()
  const resumeId = application.resume_id ?? (await findLatestParsedResumeId(userId))
  const [jobResult, resumeResult, tailoredResult, profile, bank] = await Promise.all([
    supabase
      .from('job_specs')
      .select('parsed_json, raw_text')
      .eq('id', application.job_spec_id)
      .eq('user_id', userId)
      .maybeSingle(),
    resumeId
      ? supabase
          .from('resumes')
          .select('parsed_json')
          .eq('id', resumeId)
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    application.tailored_comparison_id
      ? supabase
          .from('comparisons')
          .select('recommendations')
          .eq('id', application.tailored_comparison_id)
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    loadProfile(userId, accountEmail),
    loadSavedAnswers(userId),
  ])
  if (jobResult.error) throw jobResult.error
  if (resumeResult.error) throw resumeResult.error
  if (tailoredResult.error) throw tailoredResult.error

  const recommendations = ((tailoredResult.data?.recommendations ?? []) as Recommendation[]) ?? []
  const tailoredEdits = (application.tailored_recommendations ?? [])
    .map((index) => recommendations[index]?.suggestion)
    .filter((text): text is string => Boolean(text))

  return {
    application,
    profile,
    bank,
    context: {
      company: application.company,
      jobTitle: application.title,
      jobDescription: (jobResult.data?.raw_text as string | null) ?? '',
      job: (jobResult.data?.parsed_json as JobSpecParsed | null) ?? null,
      resume: (resumeResult.data?.parsed_json as ResumeParsed | null) ?? null,
      profile: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        location: profile.location,
      },
      savedAnswers: bank
        .filter((saved) => saved.category !== 'motivation')
        .map(({ category, question, answer }) => ({ category, question, answer })),
      tailoredEdits,
    },
  }
}
