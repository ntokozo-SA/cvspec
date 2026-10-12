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

export interface ScoreResult {
  matchScore: number
  matchedSkills: string[]
  missingSkills: string[]
}
