import type { QueueItem, QueueStatus } from '../background/queue'
import type {
  AnswerInput,
  Application,
  ApplicationAnswer,
  ApplicationStatus,
  ApplyPackage,
  AuthState,
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
  | { type: 'GET_ANSWERS'; applicationId: string }
  /** Question labels and options only; sensitive questions are never sent. */
  | { type: 'DRAFT_ANSWERS'; applicationId: string; questions: QuestionPayload[] }
  | { type: 'SAVE_ANSWERS'; applicationId: string; answers: AnswerInput[] }
  | { type: 'LIST_BANK' }
  | {
      type: 'SAVE_BANK_ANSWER'
      answer: Pick<SavedAnswer, 'category' | 'question' | 'answer'>
    }
  | {
      type: 'DRAFT_COVER_LETTER'
      applicationId: string
      tone: CoverLetterTone
      length: CoverLetterLength
    }
  | { type: 'SAVE_COVER_LETTER'; applicationId: string; coverLetter: string }
  /** Builds the saved letter as a file on the server; nothing is stored. */
  | { type: 'GET_COVER_LETTER_FILE'; applicationId: string; format: CoverLetterFormat }
  /** Records the application form URL the first time a linked form loads. */
  | { type: 'SET_APPLY_URL'; applicationId: string; url: string }
  /** From the CVSpec web app: opens the extension's queue page. */
  | { type: 'QUEUE_OPEN' }
  /** The queue saved in CVSpec, before it is started. */
  | { type: 'QUEUE_PREVIEW' }
  /** From the queue page, on the user's click. */
  | { type: 'QUEUE_START' }
  | { type: 'QUEUE_RESUME' }
  | { type: 'QUEUE_STATUS' }
  /** Only after the current job was submitted. */
  | { type: 'QUEUE_NEXT' }
  | { type: 'QUEUE_SKIP' }
  | { type: 'QUEUE_STOP' }
  /** The job board opens its own form for this job, so the queue skips it. */
  | { type: 'QUEUE_BUILT_IN'; applicationId: string }

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
  GET_ANSWERS: ApplicationAnswer[]
  DRAFT_ANSWERS: DraftedAnswer[]
  SAVE_ANSWERS: ApplicationAnswer[]
  LIST_BANK: SavedAnswer[]
  SAVE_BANK_ANSWER: SavedAnswer
  DRAFT_COVER_LETTER: CoverLetter
  SAVE_COVER_LETTER: CoverLetter
  GET_COVER_LETTER_FILE: TailoredFile
  SET_APPLY_URL: null
  QUEUE_OPEN: null
  QUEUE_PREVIEW: QueueItem[]
  QUEUE_START: QueueStatus
  QUEUE_RESUME: QueueStatus
  QUEUE_STATUS: QueueStatus
  QUEUE_NEXT: QueueStatus
  QUEUE_SKIP: QueueStatus
  QUEUE_STOP: QueueStatus
  QUEUE_BUILT_IN: QueueStatus
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
