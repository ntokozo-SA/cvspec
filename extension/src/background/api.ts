import { API_BASE } from '../shared/config'
import { ExtensionError } from '../shared/messages'
import type {
  Application,
  ApplicationStatus,
  Comparison,
  ResumeSummary,
  ScrapedJob,
} from '../shared/types'
import { getAccessToken } from './auth'

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken()
  if (!token) throw new ExtensionError('Connect the extension to CVSpec to continue', 401)

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new ExtensionError('Could not reach CVSpec. Check your connection and try again.')
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // non-JSON error body
    }
    throw new ExtensionError(message, response.status)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function findApplicationByUrl(url: string): Promise<Application | null> {
  const results = await apiFetch<Application[]>(`/applications?url=${encodeURIComponent(url)}`)
  return results[0] ?? null
}

export function listApplications(): Promise<Application[]> {
  return apiFetch<Application[]>('/applications')
}

export function saveApplication(job: ScrapedJob, analyze = true): Promise<Application> {
  return apiFetch<Application>('/applications', {
    method: 'POST',
    body: JSON.stringify({
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url,
      board: job.board,
      descriptionText: job.descriptionText,
      analyze,
    }),
  })
}

export function analyzeApplication(applicationId: string, resumeId?: string): Promise<Comparison> {
  return apiFetch<Comparison>(`/applications/${applicationId}/analyze`, {
    method: 'POST',
    body: JSON.stringify({ resumeId }),
  })
}

export function updateApplicationStatus(
  applicationId: string,
  status: ApplicationStatus,
): Promise<Application> {
  return apiFetch<Application>(`/applications/${applicationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function listResumes(): Promise<ResumeSummary[]> {
  return apiFetch<ResumeSummary[]>('/resumes')
}
