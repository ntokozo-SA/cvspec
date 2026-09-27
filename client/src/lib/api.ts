import { supabase } from './supabase'
import type {
  Application,
  ApplicationStatus,
  Comparison,
  JobSpec,
  Recommendation,
  Resume,
  SourceType,
} from '../types'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
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
    const resume: Resume = {
      id: crypto.randomUUID(),
      user_id: 'demo',
      file_name: file.name,
      storage_path: `demo/${file.name}`,
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

export async function deleteApplication(id: string): Promise<void> {
  if (isDemoMode()) {
    const index = demoApplications.findIndex((item) => item.id === id)
    if (index >= 0) demoApplications.splice(index, 1)
    return
  }
  await apiFetch<void>(`/applications/${id}`, { method: 'DELETE' })
}
