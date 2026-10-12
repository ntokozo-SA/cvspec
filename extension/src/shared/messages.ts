import type {
  Application,
  ApplicationStatus,
  ApplyPackage,
  AuthState,
  Comparison,
  ResumeSummary,
  ScrapedJob,
  Tailoring,
  TailoredFile,
  TailoredScore,
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
  | { type: 'SAVE_TAILORING'; applicationId: string; tailoring: Tailoring | null }
  | { type: 'TAILORED_SCORE'; tailoring: Tailoring }
  | { type: 'DOWNLOAD_TAILORED'; tailoring: Tailoring }
  /** Links the sender's tab, and tabs it opens shortly after, to the application. */
  | { type: 'ARM_APPLY'; applicationId: string }
  /** The application linked to the sender's tab, if any. */
  | { type: 'GET_APPLY_CONTEXT' }
  | { type: 'SET_APPLY_CONTEXT'; applicationId: string }
  | { type: 'GET_APPLY_PACKAGE'; applicationId: string }
  | { type: 'MARK_SUBMITTED'; applicationId: string }

/** Sent from the popup to the job board content script in the active tab. */
export interface ExtractJobRequest {
  type: 'EXTRACT_JOB'
}

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
  SAVE_TAILORING: Application
  TAILORED_SCORE: TailoredScore
  DOWNLOAD_TAILORED: TailoredFile
  ARM_APPLY: null
  GET_APPLY_CONTEXT: Application | null
  SET_APPLY_CONTEXT: Application
  GET_APPLY_PACKAGE: ApplyPackage
  MARK_SUBMITTED: Application
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
