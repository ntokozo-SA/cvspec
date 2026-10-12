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

/** A generated DOCX. Messages are JSON-serialized, so the bytes travel as base64. */
export interface TailoredFile {
  base64: string
  fileName: string
  /** Recommendation indexes that could not be placed in the document. */
  unapplied: number[]
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
