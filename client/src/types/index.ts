export type SourceType = 'link' | 'document' | 'text'

export interface Resume {
  id: string
  user_id: string
  file_name: string
  storage_path: string
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

export type JobBoard = 'linkedin' | 'indeed' | 'glassdoor' | 'other'

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

export interface ApiErrorBody {
  error: string
}
