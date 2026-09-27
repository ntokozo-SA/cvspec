import { getSupabaseAdmin } from '../middleware/auth.js'
import type { JobSpecParsed, ResumeParsed } from '../types/index.js'
import { generateRecommendations } from './openai.js'
import { scoreResumeAgainstJob } from './scoring.js'

export class ComparisonInputError extends Error {}

export async function runComparison(userId: string, resumeId: string, jobSpecId: string) {
  const supabase = getSupabaseAdmin()

  const [{ data: resume, error: resumeError }, { data: jobSpec, error: jobError }] =
    await Promise.all([
      supabase.from('resumes').select('*').eq('id', resumeId).eq('user_id', userId).maybeSingle(),
      supabase
        .from('job_specs')
        .select('*')
        .eq('id', jobSpecId)
        .eq('user_id', userId)
        .maybeSingle(),
    ])

  if (resumeError) throw resumeError
  if (jobError) throw jobError
  if (!resume?.parsed_json || !jobSpec?.parsed_json) {
    throw new ComparisonInputError('Resume and job spec must both be parsed first')
  }

  const resumeParsed = resume.parsed_json as ResumeParsed
  const jobParsed = jobSpec.parsed_json as JobSpecParsed
  const score = await scoreResumeAgainstJob(resumeParsed, jobParsed)
  const recommendations = await generateRecommendations({
    resume: resumeParsed,
    job: jobParsed,
    matchedSkills: score.matchedSkills,
    missingSkills: score.missingSkills,
  })

  const { data, error } = await supabase
    .from('comparisons')
    .insert({
      user_id: userId,
      resume_id: resumeId,
      job_spec_id: jobSpecId,
      match_score: score.matchScore,
      matched_skills: score.matchedSkills,
      missing_skills: score.missingSkills,
      recommendations,
    })
    .select('*, resume:resumes(*), job_spec:job_specs(*)')
    .single()

  if (error) throw error
  return data
}

export async function findLatestParsedResumeId(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('resumes')
    .select('id')
    .eq('user_id', userId)
    .not('parsed_json', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.id ?? null
}
