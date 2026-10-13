import type { Board } from './boards'

export type { Board }

export type ApplicationStatus = 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected'

export interface ScrapedJob {
  board: Board
  title: string
  company: string
  location?: string
  url: string
  descriptionText: string
  /** The board's Apply opens its own form, which CVSpec never fills. */
  builtInApply?: boolean
}

export interface Recommendation {
  section: string
  original?: string
  suggestion: string
  rationale: string
}

export interface Comparison {
  id: string
  resume_id: string
  match_score: number
  matched_skills: string[] | null
  missing_skills: string[] | null
  recommendations: Recommendation[] | null
  created_at: string
}

export interface Application {
  id: string
  title: string | null
  company: string | null
  location: string | null
  board: Board
  source_url: string
  status: ApplicationStatus
  comparison_id: string | null
  resume_id: string | null
  created_at: string
  comparison: Comparison | null
  tailored_comparison_id: string | null
  tailored_recommendations: number[] | null
  cover_letter?: string | null
  cover_letter_updated_at?: string | null
  queue_position?: number | null
  apply_url?: string | null
  built_in_apply?: boolean | null
}

export interface Tailoring {
  comparisonId: string
  recommendations: number[]
}

export interface TailoredScore {
  matchScore: number
  previousScore: number
  matchedSkills: string[]
  missingSkills: string[]
}

/** A generated file. Messages are JSON-serialized, so the bytes travel as base64. */
export interface TailoredFile {
  base64: string
  fileName: string
  /** Recommendation indexes that could not be placed in the document. */
  unapplied: number[]
  /** Defaults to DOCX. */
  mimeType?: string
}

export type CoverLetterTone = 'professional' | 'warm' | 'concise'
export type CoverLetterLength = 'short' | 'medium' | 'long'
export type CoverLetterFormat = 'docx' | 'pdf'

export interface CoverLetter {
  coverLetter: string | null
  updatedAt: string | null
}

export interface ApplicantProfile {
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  location: string | null
  linkedinUrl: string | null
  websiteUrl: string | null
  updatedAt: string | null
  saved: boolean
}

export interface ApplyPackage {
  application: Application
  profile: ApplicantProfile
  file: TailoredFile | null
  /** Why `file` is missing, shown to the user instead of attaching a resume. */
  fileError: string | null
}

export type AnswerCategory =
  | 'salary'
  | 'notice_period'
  | 'start_date'
  | 'relocation'
  | 'work_authorization'
  | 'motivation'
  | 'referral_source'
  | 'other'

export type QuestionKind = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox'

export type AnswerSource = 'bank' | 'ai' | 'user'

/** What the server sees of a form question: its label and options, never the page's values. */
export interface QuestionPayload {
  key: string
  label: string
  kind: QuestionKind
  options: string[]
  maxLength: number | null
  category: AnswerCategory
  required: boolean
}

export interface SavedAnswer {
  id: string
  category: AnswerCategory
  question: string
  answer: string
  updatedAt: string
}

export interface ApplicationAnswer {
  questionKey: string
  questionLabel: string
  answer: string
  source: AnswerSource
  updatedAt: string
}

export interface DraftedAnswer {
  key: string
  answer: string
  source: AnswerSource
  needsUserInput: boolean
}

export interface AnswerInput {
  questionKey: string
  questionLabel: string
  answer: string
  source: AnswerSource
}

export interface ResumeSummary {
  id: string
  file_name: string
  parsed_json: unknown
  created_at: string
}

export interface AuthState {
  connected: boolean
  email?: string
}
