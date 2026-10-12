import { API_BASE } from '../shared/config'
import { ExtensionError } from '../shared/messages'
import type {
  ApplicantProfile,
  Application,
  ApplicationStatus,
  Comparison,
  ResumeSummary,
  ScrapedJob,
  Tailoring,
  TailoredFile,
  TailoredScore,
} from '../shared/types'
import { getAccessToken } from './auth'

async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
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
  return response
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiRequest(path, init)
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

export async function getApplication(applicationId: string): Promise<Application> {
  const application = (await listApplications()).find((item) => item.id === applicationId)
  if (!application) throw new ExtensionError('This saved job no longer exists in CVSpec', 404)
  return application
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

export function saveTailoring(
  applicationId: string,
  tailoring: Tailoring | null,
): Promise<Application> {
  return apiFetch<Application>(`/applications/${applicationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ tailoring }),
  })
}

export function tailoredScore(tailoring: Tailoring): Promise<TailoredScore> {
  return apiFetch<TailoredScore>(`/comparisons/${tailoring.comparisonId}/tailored-score`, {
    method: 'POST',
    body: JSON.stringify({ recommendations: tailoring.recommendations }),
  })
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** Builds the tailored DOCX on the server. The server does not store it. */
export async function fetchTailoredResume(tailoring: Tailoring): Promise<TailoredFile> {
  const response = await apiRequest(`/comparisons/${tailoring.comparisonId}/tailored-resume`, {
    method: 'POST',
    body: JSON.stringify({ recommendations: tailoring.recommendations }),
  })
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plain = disposition.match(/filename="([^"]+)"/i)?.[1]
  const unapplied = (response.headers.get('X-Unapplied-Recommendations') ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number)

  return {
    base64: toBase64(await response.arrayBuffer()),
    fileName: encoded ? decodeURIComponent(encoded) : (plain ?? 'tailored-resume.docx'),
    unapplied,
  }
}

export function getProfile(): Promise<ApplicantProfile> {
  return apiFetch<ApplicantProfile>('/profile')
}

export function listResumes(): Promise<ResumeSummary[]> {
  return apiFetch<ResumeSummary[]>('/resumes')
}
