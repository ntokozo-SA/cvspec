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
