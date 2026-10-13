import type { AnswerCategory, QuestionKind } from '../../../shared/types'

export type ProfileField =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'location'
  | 'linkedinUrl'
  | 'websiteUrl'

export type TextField = HTMLInputElement | HTMLTextAreaElement

/** A custom question on the form. Only its label and options ever leave the page. */
export interface CustomQuestion {
  /** Adapter system plus a hash of the normalised label; stable across visits. */
  key: string
  label: string
  kind: QuestionKind
  options: string[]
  required: boolean
  maxLength: number | null
  category: AnswerCategory
  /** POPIA special information or an identity number: never read, sent or filled. */
  sensitive: boolean
  /** The control, or every input in a radio or checkbox group. */
  elements: HTMLElement[]
  /**
   * A custom dropdown (Workday) whose options only render once opened. Asked as a text question;
   * filling opens it and picks the matching option.
   */
  listbox?: boolean
}

export type ApplySystem =
  | 'greenhouse'
  | 'lever'
  | 'smartrecruiters'
  | 'workday'
  | 'successfactors'
  | 'workable'
  | 'generic'

/** Where a multi-step application (Workday) is. `index` is 1-based. */
export interface WizardStep {
  index: number
  total: number
  name: string
}

export interface ApplyFormAdapter {
  system: ApplySystem
  matches(url: URL): boolean
  /** The application form (or the step's container on wizard forms), null until rendered. */
  form(): HTMLElement | null
  /** True once the form has rendered enough to fill. */
  isReady(): boolean
  /** Multi-step forms only: the step on screen. CVSpec fills one step and never clicks Next. */
  currentStep?(): WizardStep | null
  /** True on sign-in or create-account pages, which the candidate completes themselves. */
  isSignIn?(): boolean
  resumeInput(): HTMLInputElement | null
  /** The cover-letter file upload; never the resume input. */
  coverLetterInput(): HTMLInputElement | null
  /** A text box meant for a cover letter, used when the form has no cover-letter upload. */
  coverLetterTextarea(): HTMLTextAreaElement | null
  fields(): Partial<Record<ProfileField, TextField>>
  /** Custom questions, sensitive ones flagged. Contact fields and file inputs are excluded. */
  questions(): CustomQuestion[]
  /** Required fields that are still empty after filling. */
  requiredUnfilled(): HTMLElement[]
  /** True when the page shows this system's "application received" view. */
  isConfirmation(): boolean
}
