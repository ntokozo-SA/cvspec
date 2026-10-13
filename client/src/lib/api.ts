import { supabase } from './supabase'
import type {
  ApplicantProfile,
  ApplicantProfileInput,
  Application,
  ApplicationAnswer,
  ApplicationStatus,
  Comparison,
  CoverLetter,
  CoverLetterFormat,
  CoverLetterLength,
  CoverLetterTone,
  JobSpec,
  PrepareResult,
  Recommendation,
  Resume,
  SavedAnswer,
  SavedAnswerInput,
  SourceType,
} from '../types'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore parse errors
    }
    throw new Error(message)
  }

  return response
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiRequest(path, init)

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

function fileNameFrom(response: Response, fallback: string): string {
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plain = disposition.match(/filename="([^"]+)"/i)?.[1]
  return encoded ? decodeURIComponent(encoded) : (plain ?? fallback)
}

const demoResumes: Resume[] = []
const demoJobSpecs: JobSpec[] = []
const demoComparisons: Comparison[] = []
const demoApplications: Application[] = []

function isDemoMode(): boolean {
  return !import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_DEMO_MODE === 'true'
}

export async function listResumes(): Promise<Resume[]> {
  if (isDemoMode()) return [...demoResumes]
  return apiFetch<Resume[]>('/resumes')
}

export async function uploadResume(file: File): Promise<Resume> {
  if (isDemoMode()) {
    const isPdf = /\.pdf$/i.test(file.name)
    const fileName = isPdf ? file.name.replace(/\.pdf$/i, '.docx') : file.name
    const resume: Resume = {
      id: crypto.randomUUID(),
      user_id: 'demo',
      file_name: fileName,
      storage_path: `demo/${fileName}`,
      original_file_name: isPdf ? file.name : null,
      original_storage_path: isPdf ? `demo/${file.name}` : null,
      parsed_json: {
        name: 'Demo Candidate',
        skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'REST APIs'],
        experience: [
          {
            title: 'Frontend Developer',
            company: 'Example Co',
            bullets: [
              'Built React dashboards used by 12 internal teams',
              'Improved LCP on the marketing site from 3.8s to 1.9s',
            ],
          },
        ],
        summary: 'Frontend developer focused on product UI and web performance.',
      },
      parsed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }
    demoResumes.unshift(resume)
    return resume
  }

  const form = new FormData()
  form.append('file', file)
  return apiFetch<Resume>('/resumes', { method: 'POST', body: form })
}

export async function deleteResume(id: string): Promise<void> {
  if (isDemoMode()) {
    const index = demoResumes.findIndex((item) => item.id === id)
    if (index >= 0) demoResumes.splice(index, 1)
    return
  }
  await apiFetch<void>(`/resumes/${id}`, { method: 'DELETE' })
}

/** The resume as uploaded: the original PDF for converted resumes, otherwise the stored file. */
export async function getResumeFile(resume: Resume): Promise<DownloadedFile> {
  if (isDemoMode()) {
    throw new Error('Resume previews need a signed-in account.')
  }
  const response = await apiRequest(`/resumes/${resume.id}/file`)
  return {
    blob: await response.blob(),
    fileName: fileNameFrom(response, resume.original_file_name ?? resume.file_name),
  }
}

export async function listJobSpecs(): Promise<JobSpec[]> {
  if (isDemoMode()) return [...demoJobSpecs]
  return apiFetch<JobSpec[]>('/job-specs')
}

export async function createJobSpec(input: {
  sourceType: SourceType
  text?: string
  url?: string
  file?: File
}): Promise<JobSpec> {
  if (isDemoMode()) {
    const title =
      input.sourceType === 'link'
        ? (input.url ?? 'Linked job posting')
        : input.sourceType === 'document'
          ? (input.file?.name ?? 'Uploaded job spec')
          : 'Pasted job posting'

    const job: JobSpec = {
      id: crypto.randomUUID(),
      user_id: 'demo',
      source_type: input.sourceType,
      source_url: input.url ?? null,
      storage_path: null,
      raw_text: input.text ?? null,
      parsed_json: {
        title: 'Senior Frontend Engineer',
        requiredSkills: [
          'TypeScript',
          'React',
          'CSS',
          'Accessibility',
          'Testing Library',
          'GraphQL',
        ],
        preferredSkills: ['Vite', 'PWA', 'Design systems'],
        yearsExperience: 4,
        responsibilities: [
          'Own product UI quality across web clients',
          'Partner with design on interaction polish',
          'Mentor juniors on frontend architecture',
        ],
        keywords: ['frontend', 'TypeScript', 'React', 'accessibility'],
      },
      created_at: new Date().toISOString(),
      title,
    }
    demoJobSpecs.unshift(job)
    return job
  }

  if (input.sourceType === 'document' && input.file) {
    const form = new FormData()
    form.append('sourceType', input.sourceType)
    form.append('file', input.file)
    return apiFetch<JobSpec>('/job-specs', { method: 'POST', body: form })
  }

  return apiFetch<JobSpec>('/job-specs', {
    method: 'POST',
    body: JSON.stringify({
      sourceType: input.sourceType,
      text: input.text,
      url: input.url,
    }),
  })
}

export async function deleteJobSpec(id: string): Promise<void> {
  if (isDemoMode()) {
    const index = demoJobSpecs.findIndex((item) => item.id === id)
    if (index >= 0) demoJobSpecs.splice(index, 1)
    return
  }
  await apiFetch<void>(`/job-specs/${id}`, { method: 'DELETE' })
}

export async function listComparisons(): Promise<Comparison[]> {
  if (isDemoMode()) return [...demoComparisons]
  return apiFetch<Comparison[]>('/comparisons')
}

export async function getComparison(id: string): Promise<Comparison> {
  if (isDemoMode()) {
    const found = demoComparisons.find((item) => item.id === id)
    if (!found) throw new Error('Comparison not found')
    return found
  }
  return apiFetch<Comparison>(`/comparisons/${id}`)
}

export async function createComparison(resumeId: string, jobSpecId: string): Promise<Comparison> {
  if (isDemoMode()) {
    const resume = demoResumes.find((item) => item.id === resumeId)
    const jobSpec = demoJobSpecs.find((item) => item.id === jobSpecId)
    if (!resume || !jobSpec) throw new Error('Resume and job spec are required')

    const resumeSkills = (resume.parsed_json?.skills ?? []).map((s) => s.toLowerCase())
    const required = jobSpec.parsed_json?.requiredSkills ?? []
    const matched = required.filter((skill) =>
      resumeSkills.some(
        (rs) => rs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(rs),
      ),
    )
    const missing = required.filter((skill) => !matched.includes(skill))
    const score = required.length === 0 ? 0 : Math.round((matched.length / required.length) * 100)

    const recommendations: Recommendation[] = missing.slice(0, 3).map((skill) => ({
      section: 'Skills / Experience',
      suggestion: `Add a bullet that shows hands-on ${skill} work with a measurable outcome.`,
      rationale: `The posting lists ${skill} as required, and it is not clearly evidenced on the resume.`,
    }))

    if (recommendations.length === 0) {
      recommendations.push({
        section: 'Summary',
        suggestion:
          'Tighten the summary to mirror the job title and top required skills in the first two lines.',
        rationale: 'You already cover the required skills; keyword alignment will help scanners.',
      })
    }

    const comparison: Comparison = {
      id: crypto.randomUUID(),
      user_id: 'demo',
      resume_id: resumeId,
      job_spec_id: jobSpecId,
      match_score: score,
      matched_skills: matched,
      missing_skills: missing,
      recommendations,
      created_at: new Date().toISOString(),
      resume,
      job_spec: jobSpec,
    }
    demoComparisons.unshift(comparison)
    return comparison
  }

  return apiFetch<Comparison>('/comparisons', {
    method: 'POST',
    body: JSON.stringify({ resumeId, jobSpecId }),
  })
}

export interface TailoredResume {
  blob: Blob
  fileName: string
  /** Recommendation indexes that could not be placed in the document. */
  unapplied: number[]
}

export async function generateTailoredResume(
  comparisonId: string,
  recommendations: number[],
): Promise<TailoredResume> {
  if (isDemoMode()) {
    throw new Error('Tailored resumes need a signed-in account with an uploaded DOCX resume.')
  }

  const response = await apiRequest(`/comparisons/${comparisonId}/tailored-resume`, {
    method: 'POST',
    body: JSON.stringify({ recommendations }),
  })
  const unapplied = (response.headers.get('X-Unapplied-Recommendations') ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number)

  return {
    blob: await response.blob(),
    fileName: fileNameFrom(response, 'tailored-resume.docx'),
    unapplied,
  }
}

export interface TailoredScore {
  matchScore: number
  previousScore: number
  matchedSkills: string[]
  missingSkills: string[]
}

export async function scoreTailoredResume(
  comparisonId: string,
  recommendations: number[],
): Promise<TailoredScore> {
  if (isDemoMode()) {
    throw new Error('Tailored resumes need a signed-in account with an uploaded DOCX resume.')
  }
  return apiFetch<TailoredScore>(`/comparisons/${comparisonId}/tailored-score`, {
    method: 'POST',
    body: JSON.stringify({ recommendations }),
  })
}

export async function listApplications(): Promise<Application[]> {
  if (isDemoMode()) return [...demoApplications]
  return apiFetch<Application[]>('/applications')
}

export async function updateApplication(
  id: string,
  patch: { status?: ApplicationStatus; resumeId?: string | null },
): Promise<Application> {
  if (isDemoMode()) {
    const found = demoApplications.find((item) => item.id === id)
    if (!found) throw new Error('Application not found')
    if (patch.status) {
      found.status = patch.status
      found.status_updated_at = new Date().toISOString()
    }
    if (patch.resumeId !== undefined) found.resume_id = patch.resumeId
    return { ...found }
  }
  return apiFetch<Application>(`/applications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

let demoProfile: ApplicantProfile = {
  firstName: 'Demo',
  lastName: 'Candidate',
  email: null,
  phone: null,
  location: null,
  linkedinUrl: null,
  websiteUrl: null,
  updatedAt: null,
  saved: false,
}

export async function getProfile(): Promise<ApplicantProfile> {
  if (isDemoMode()) return { ...demoProfile }
  return apiFetch<ApplicantProfile>('/profile')
}

export async function updateProfile(input: ApplicantProfileInput): Promise<ApplicantProfile> {
  if (isDemoMode()) {
    demoProfile = { ...input, updatedAt: new Date().toISOString(), saved: true }
    return { ...demoProfile }
  }
  return apiFetch<ApplicantProfile>('/profile', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

let demoSavedAnswers: SavedAnswer[] = []

export async function listSavedAnswers(): Promise<SavedAnswer[]> {
  if (isDemoMode()) return [...demoSavedAnswers]
  return apiFetch<SavedAnswer[]>('/profile/answers')
}

export async function createSavedAnswer(input: SavedAnswerInput): Promise<SavedAnswer> {
  if (isDemoMode()) {
    const answer: SavedAnswer = {
      ...input,
      id: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    }
    demoSavedAnswers = [answer, ...demoSavedAnswers]
    return answer
  }
  return apiFetch<SavedAnswer>('/profile/answers', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateSavedAnswer(id: string, input: SavedAnswerInput): Promise<SavedAnswer> {
  if (isDemoMode()) {
    const answer: SavedAnswer = { ...input, id, updatedAt: new Date().toISOString() }
    demoSavedAnswers = demoSavedAnswers.map((item) => (item.id === id ? answer : item))
    return answer
  }
  return apiFetch<SavedAnswer>(`/profile/answers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteSavedAnswer(id: string): Promise<void> {
  if (isDemoMode()) {
    demoSavedAnswers = demoSavedAnswers.filter((item) => item.id !== id)
    return
  }
  await apiFetch<void>(`/profile/answers/${id}`, { method: 'DELETE' })
}

const demoApplicationAnswers = new Map<string, ApplicationAnswer[]>()

export async function listApplicationAnswers(applicationId: string): Promise<ApplicationAnswer[]> {
  if (isDemoMode()) return [...(demoApplicationAnswers.get(applicationId) ?? [])]
  return apiFetch<ApplicationAnswer[]>(`/applications/${applicationId}/answers`)
}

export async function saveApplicationAnswers(
  applicationId: string,
  answers: Array<Pick<ApplicationAnswer, 'questionKey' | 'questionLabel' | 'answer'>>,
): Promise<ApplicationAnswer[]> {
  if (isDemoMode()) {
    const now = new Date().toISOString()
    const current = new Map(
      (demoApplicationAnswers.get(applicationId) ?? []).map((item) => [item.questionKey, item]),
    )
    for (const item of answers) {
      if (item.answer.trim()) {
        current.set(item.questionKey, { ...item, source: 'user', updatedAt: now })
      } else {
        current.delete(item.questionKey)
      }
    }
    const list = [...current.values()]
    demoApplicationAnswers.set(applicationId, list)
    return list
  }
  return apiFetch<ApplicationAnswer[]>(`/applications/${applicationId}/answers`, {
    method: 'PUT',
    body: JSON.stringify({
      answers: answers.map((item) => ({ ...item, source: 'user' })),
    }),
  })
}

export async function getApplication(id: string): Promise<Application> {
  if (isDemoMode()) {
    const found = demoApplications.find((item) => item.id === id)
    if (!found) throw new Error('Application not found')
    return { ...found }
  }
  return apiFetch<Application>(`/applications/${id}`)
}

export async function getCoverLetter(applicationId: string): Promise<CoverLetter> {
  if (isDemoMode()) {
    const found = demoApplications.find((item) => item.id === applicationId)
    return {
      coverLetter: found?.cover_letter ?? null,
      updatedAt: found?.cover_letter_updated_at ?? null,
    }
  }
  return apiFetch<CoverLetter>(`/applications/${applicationId}/cover-letter`)
}

export async function saveCoverLetter(
  applicationId: string,
  coverLetter: string,
): Promise<CoverLetter> {
  if (isDemoMode()) {
    const found = demoApplications.find((item) => item.id === applicationId)
    const text = coverLetter.trim() || null
    const updatedAt = text ? new Date().toISOString() : null
    if (found) {
      found.cover_letter = text
      found.cover_letter_updated_at = updatedAt
    }
    return { coverLetter: text, updatedAt }
  }
  return apiFetch<CoverLetter>(`/applications/${applicationId}/cover-letter`, {
    method: 'PUT',
    body: JSON.stringify({ coverLetter }),
  })
}

export async function draftCoverLetter(
  applicationId: string,
  options: { tone: CoverLetterTone; length: CoverLetterLength },
): Promise<CoverLetter> {
  if (isDemoMode()) {
    throw new Error('Cover letters are drafted from your resume, so they need a signed-in account.')
  }
  return apiFetch<CoverLetter>(`/applications/${applicationId}/cover-letter/draft`, {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export interface DownloadedFile {
  blob: Blob
  fileName: string
}

export async function downloadCoverLetter(
  applicationId: string,
  format: CoverLetterFormat,
): Promise<DownloadedFile> {
  if (isDemoMode()) {
    throw new Error('Cover letter files need a signed-in account.')
  }
  const response = await apiRequest(
    `/applications/${applicationId}/cover-letter/file?format=${format}`,
    { method: 'POST' },
  )
  return {
    blob: await response.blob(),
    fileName: fileNameFrom(response, `cover-letter.${format}`),
  }
}

export const MAX_QUEUE = 20

function demoQueue(): Application[] {
  return demoApplications
    .filter((item) => item.queue_position != null)
    .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0))
    .map((item) => ({ ...item }))
}

export async function getApplyQueue(): Promise<Application[]> {
  if (isDemoMode()) return demoQueue()
  return apiFetch<Application[]>('/applications/queue')
}

/** Replaces the queue with `ids`, in order. Only saved jobs on external forms are accepted. */
export async function setApplyQueue(ids: string[]): Promise<Application[]> {
  if (isDemoMode()) {
    for (const item of demoApplications) {
      const index = ids.indexOf(item.id)
      item.queue_position = index >= 0 ? index + 1 : null
      item.queued_at = index >= 0 ? (item.queued_at ?? new Date().toISOString()) : null
    }
    return demoQueue()
  }
  return apiFetch<Application[]>('/applications/queue', {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  })
}

export async function clearApplyQueue(): Promise<void> {
  if (isDemoMode()) {
    await setApplyQueue([])
    return
  }
  await apiFetch<void>('/applications/queue', { method: 'DELETE' })
}

/** Scores, tailors and (optionally) drafts a cover letter for a job. Safe to call again. */
export async function prepareApplication(
  id: string,
  options: { coverLetter: boolean },
): Promise<PrepareResult> {
  if (isDemoMode()) {
    const found = demoApplications.find((item) => item.id === id)
    if (!found) throw new Error('Application not found')
    return { application: { ...found }, steps: { analyzed: false, tailored: false, coverLetter: false } }
  }
  return apiFetch<PrepareResult>(`/applications/${id}/prepare`, {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export async function deleteApplication(id: string): Promise<void> {
  if (isDemoMode()) {
    const index = demoApplications.findIndex((item) => item.id === id)
    if (index >= 0) demoApplications.splice(index, 1)
    return
  }
  await apiFetch<void>(`/applications/${id}`, { method: 'DELETE' })
}
