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
  suggestion: string
  rationale: string
}

export interface ScoreResult {
  matchScore: number
  matchedSkills: string[]
  missingSkills: string[]
}
