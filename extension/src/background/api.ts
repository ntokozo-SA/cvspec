import { API_BASE } from '../shared/config'
import { ExtensionError } from '../shared/messages'
import type {
  AnswerInput,
  ApplicantProfile,
  Application,
  ApplicationAnswer,
  ApplicationStatus,
  Comparison,
  CoverLetter,
  CoverLetterFormat,
  CoverLetterLength,
  CoverLetterTone,
  DraftedAnswer,
  QuestionPayload,
  ResumeSummary,
  SavedAnswer,
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
  try {
    return await apiFetch<Application>(`/applications/${encodeURIComponent(applicationId)}`)
  } catch (err) {
    if (err instanceof ExtensionError && err.status === 404) {
      throw new ExtensionError('This saved job no longer exists in CVSpec', 404)
    }
    throw err
  }
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
      builtInApply: job.builtInApply,
    }),
  })
}

export function getApplyQueue(): Promise<Application[]> {
  return apiFetch<Application[]>('/applications/queue')
}

export function updateApplyInfo(
  applicationId: string,
  patch: { applyUrl?: string; builtInApply?: boolean },
): Promise<Application> {
  return apiFetch<Application>(`/applications/${applicationId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
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

function fileNameFrom(response: Response, fallback: string): string {
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plain = disposition.match(/filename="([^"]+)"/i)?.[1]
  return encoded ? decodeURIComponent(encoded) : (plain ?? fallback)
}

/** Builds the tailored DOCX on the server. The server does not store it. */
export async function fetchTailoredResume(tailoring: Tailoring): Promise<TailoredFile> {
  const response = await apiRequest(`/comparisons/${tailoring.comparisonId}/tailored-resume`, {
    method: 'POST',
    body: JSON.stringify({ recommendations: tailoring.recommendations }),
  })
  const unapplied = (response.headers.get('X-Unapplied-Recommendations') ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number)

  return {
    base64: toBase64(await response.arrayBuffer()),
    fileName: fileNameFrom(response, 'tailored-resume.docx'),
    unapplied,
  }
}

export function draftCoverLetter(
  applicationId: string,
  options: { tone: CoverLetterTone; length: CoverLetterLength },
): Promise<CoverLetter> {
  return apiFetch<CoverLetter>(`/applications/${applicationId}/cover-letter/draft`, {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export function saveCoverLetter(applicationId: string, coverLetter: string): Promise<CoverLetter> {
  return apiFetch<CoverLetter>(`/applications/${applicationId}/cover-letter`, {
    method: 'PUT',
    body: JSON.stringify({ coverLetter }),
  })
}

/** Builds the saved cover letter as DOCX or PDF on the server. The server does not store it. */
export async function fetchCoverLetterFile(
  applicationId: string,
  format: CoverLetterFormat,
): Promise<TailoredFile> {
  const response = await apiRequest(
    `/applications/${applicationId}/cover-letter/file?format=${format}`,
    { method: 'POST' },
  )
  return {
    base64: toBase64(await response.arrayBuffer()),
    fileName: fileNameFrom(response, `cover-letter.${format}`),
    unapplied: [],
    mimeType:
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
}

export function getProfile(): Promise<ApplicantProfile> {
  return apiFetch<ApplicantProfile>('/profile')
}

export function listResumes(): Promise<ResumeSummary[]> {
  return apiFetch<ResumeSummary[]>('/resumes')
}

export function getAnswers(applicationId: string): Promise<ApplicationAnswer[]> {
  return apiFetch<ApplicationAnswer[]>(`/applications/${applicationId}/answers`)
}

export async function draftAnswers(
  applicationId: string,
  questions: QuestionPayload[],
): Promise<DraftedAnswer[]> {
  const body = await apiFetch<{ answers: DraftedAnswer[] }>(
    `/applications/${applicationId}/answers/draft`,
    { method: 'POST', body: JSON.stringify({ questions }) },
  )
  return body.answers
}

export function saveAnswers(
  applicationId: string,
  answers: AnswerInput[],
): Promise<ApplicationAnswer[]> {
  return apiFetch<ApplicationAnswer[]>(`/applications/${applicationId}/answers`, {
    method: 'PUT',
    body: JSON.stringify({ answers }),
  })
}

export function listBank(): Promise<SavedAnswer[]> {
  return apiFetch<SavedAnswer[]>('/profile/answers')
}

export function saveBankAnswer(
  answer: Pick<SavedAnswer, 'category' | 'question' | 'answer'>,
): Promise<SavedAnswer> {
  return apiFetch<SavedAnswer>('/profile/answers', {
    method: 'POST',
    body: JSON.stringify(answer),
  })
}
