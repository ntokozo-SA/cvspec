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

export const ANSWER_CATEGORIES = [
  'salary',
  'notice_period',
  'start_date',
  'relocation',
  'work_authorization',
  'motivation',
  'referral_source',
  'other',
] as const

export type AnswerCategory = (typeof ANSWER_CATEGORIES)[number]

export type QuestionKind = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox'

export type AnswerSource = 'bank' | 'ai' | 'user'

/** A custom question read from an application form: its label and options, never its value. */
export interface QuestionInput {
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
  /** True when CVSpec could not answer from what it knows; the candidate must fill it in. */
  needsUserInput: boolean
}

export interface ScoreResult {
  matchScore: number
  matchedSkills: string[]
  missingSkills: string[]
}
