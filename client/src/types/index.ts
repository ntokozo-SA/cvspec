export type SourceType = 'link' | 'document' | 'text'

export interface Resume {
  id: string
  user_id: string
  file_name: string
  storage_path: string
  original_file_name: string | null
  original_storage_path: string | null
  parsed_json: ResumeParsed | null
  parsed_at: string | null
  created_at: string
}

export interface ResumeParsed {
  name?: string
  email?: string
  skills: string[]
  experience: Array<{
    title: string
    company: string
    bullets: string[]
  }>
  education?: string[]
  summary?: string
}

export interface JobSpec {
  id: string
  user_id: string
  source_type: SourceType
  source_url: string | null
  storage_path: string | null
  raw_text: string | null
  parsed_json: JobSpecParsed | null
  created_at: string
  title?: string
}

export interface JobSpecParsed {
  title?: string
  requiredSkills: string[]
  preferredSkills: string[]
  yearsExperience?: number
  responsibilities: string[]
  keywords: string[]
}

export interface Recommendation {
  section: string
  original?: string
  suggestion: string
  rationale: string
}

export interface Comparison {
  id: string
  user_id: string
  resume_id: string
  job_spec_id: string
  match_score: number
  matched_skills: string[]
  missing_skills: string[]
  recommendations: Recommendation[]
  created_at: string
  resume?: Resume
  job_spec?: JobSpec
}

export type ApplicationStatus = 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected'

export type JobBoard =
  | 'linkedin'
  | 'indeed'
  | 'glassdoor'
  | 'ziprecruiter'
  | 'google_jobs'
  | 'careerbuilder'
  | 'monster'
  | 'simplyhired'
  | 'talention'
  | 'flexjobs'
  | 'weworkremotely'
  | 'remoteco'
  | 'dice'
  | 'wellfound'
  | 'hired'
  | 'builtin'
  | 'handshake'
  | 'snagajob'
  | 'upwork'
  | 'fiverr'
  | 'idealist'
  | 'peoplecurated'
  | 'pnet'
  | 'careers24'
  | 'careerjunction'
  | 'offerzen'
  | 'other'

export interface Application {
  id: string
  user_id: string
  job_spec_id: string
  comparison_id: string | null
  resume_id: string | null
  title: string | null
  company: string | null
  location: string | null
  board: JobBoard
  source_url: string
  status: ApplicationStatus
  status_updated_at: string
  created_at: string
  tailored_comparison_id: string | null
  tailored_recommendations: number[] | null
  cover_letter?: string | null
  cover_letter_updated_at?: string | null
  /** 1-based place in the apply queue, or null when not queued. */
  queue_position?: number | null
  queued_at?: string | null
  /** The application form URL, recorded when the extension first fills it. */
  apply_url?: string | null
  /** The board's own form (Easy Apply, Indeed Apply) is used; CVSpec never fills it. */
  built_in_apply?: boolean | null
  job_spec?: Pick<JobSpec, 'id' | 'source_url' | 'parsed_json' | 'created_at'> | null
  comparison?: Pick<
    Comparison,
    | 'id'
    | 'match_score'
    | 'matched_skills'
    | 'missing_skills'
    | 'recommendations'
    | 'resume_id'
    | 'created_at'
  > | null
}

export interface PrepareSteps {
  analyzed: boolean
  tailored: boolean
  coverLetter: boolean
}

export interface PrepareResult {
  application: Application
  steps: PrepareSteps
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
  /** False when the values are defaults taken from the latest parsed resume. */
  saved: boolean
}

export type ApplicantProfileInput = Omit<ApplicantProfile, 'updatedAt' | 'saved'>

export type AnswerCategory =
  | 'salary'
  | 'notice_period'
  | 'start_date'
  | 'relocation'
  | 'work_authorization'
  | 'motivation'
  | 'referral_source'
  | 'other'

export interface SavedAnswer {
  id: string
  category: AnswerCategory
  question: string
  answer: string
  updatedAt: string
}

export type SavedAnswerInput = Pick<SavedAnswer, 'category' | 'question' | 'answer'>

export interface ApplicationAnswer {
  questionKey: string
  questionLabel: string
  answer: string
  source: 'bank' | 'ai' | 'user'
  updatedAt: string
}

export type CoverLetterTone = 'professional' | 'warm' | 'concise'
export type CoverLetterLength = 'short' | 'medium' | 'long'
export type CoverLetterFormat = 'docx' | 'pdf'

export interface CoverLetter {
  coverLetter: string | null
  updatedAt: string | null
}

export interface ApiErrorBody {
  error: string
}
