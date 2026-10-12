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

export interface ApplyFormAdapter {
  system: 'greenhouse' | 'lever' | 'generic'
  matches(url: URL): boolean
  /** The application form, or null while it has not rendered. */
  form(): HTMLFormElement | null
  /** True once the form has rendered enough to fill. */
  isReady(): boolean
  resumeInput(): HTMLInputElement | null
  fields(): Partial<Record<ProfileField, TextField>>
  /** Required fields that are still empty after filling. */
  requiredUnfilled(): HTMLElement[]
  /** True when the page shows this system's "application received" view. */
  isConfirmation(): boolean
}
