import type {
  Application,
  ApplicationStatus,
  AuthState,
  Comparison,
  ResumeSummary,
  ScrapedJob,
} from './types'

export type ExtensionRequest =
  | { type: 'GET_AUTH' }
  | { type: 'HANDOFF'; tokenHash: string }
  | { type: 'SIGNOUT' }
  | { type: 'CHECK_SAVED'; url: string }
  | { type: 'SAVE_JOB'; job: ScrapedJob; analyze?: boolean }
  | { type: 'LIST_APPLICATIONS' }
  | { type: 'LIST_RESUMES' }
  | { type: 'ANALYZE'; applicationId: string; resumeId?: string }
  | { type: 'UPDATE_STATUS'; applicationId: string; status: ApplicationStatus }

export interface ResponseMap {
  GET_AUTH: AuthState
  HANDOFF: AuthState
  SIGNOUT: AuthState
  CHECK_SAVED: Application | null
  SAVE_JOB: Application
  LIST_APPLICATIONS: Application[]
  LIST_RESUMES: ResumeSummary[]
  ANALYZE: Comparison
  UPDATE_STATUS: Application
}

export type ExtensionResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number }

export class ExtensionError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }

  get unauthenticated(): boolean {
    return this.status === 401
  }
}

export async function sendMessage<R extends ExtensionRequest>(
  request: R,
): Promise<ResponseMap[R['type']]> {
  const response = (await chrome.runtime.sendMessage(request)) as
    | ExtensionResponse<ResponseMap[R['type']]>
    | undefined
  if (!response) throw new ExtensionError('CVSpec extension did not respond')
  if (!response.ok) throw new ExtensionError(response.error, response.status)
  return response.data
}
