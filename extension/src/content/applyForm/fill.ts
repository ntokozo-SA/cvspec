import type {
  ApplicantProfile,
  ApplyPackage,
  CoverLetterFormat,
  TailoredFile,
} from '../../shared/types'
import type { ApplyFormAdapter, CustomQuestion, ProfileField, TextField } from './adapters/types'
import { CONFIRM_EMAIL, describe } from './adapters/labels'
import { deepQueryAll, isVisible, waitFor } from './dom'
import { chosenOptions, isAnswered, optionLabel } from './questions'

export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const HIGHLIGHT_ATTR = 'data-cvspec-needs-input'
export const SENSITIVE_ATTR = 'data-cvspec-sensitive'
const NEEDS_INPUT_COLOR = '#b7791f'
const SENSITIVE_COLOR = '#6b46c1'

export interface FillReport {
  filled: ProfileField[]
  /** Fields the page already had a value for, left untouched. */
  kept: ProfileField[]
  fileName: string | null
  /** Why the resume was not attached, if it was not. */
  fileProblem: string | null
  unappliedEdits: number
  needsInput: number
  /** Custom questions answered from the reviewed answers. */
  answered: number
  /** Sensitive questions left for the candidate (outlined in purple). */
  sensitive: number
  coverLetterFileName: string | null
  /** True when the letter was pasted into a text box instead of attached. */
  coverLetterPasted: boolean
  coverLetterProblem: string | null
}

export interface CoverLetterSource {
  text: string
  /** Builds the saved letter as a file; called only when the form has a cover-letter upload. */
  fetchFile: (format: CoverLetterFormat) => Promise<TailoredFile>
}

export { isVisible }

/** Sets a value so React, Vue and plain listeners all see the change. */
export function setFieldValue(field: TextField, value: string): void {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (setter) setter.call(field, value)
  else field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
  field.dispatchEvent(new Event('blur', { bubbles: true }))
}

/** Whether a file input's `accept` attribute allows a DOCX. An empty `accept` allows anything. */
export function acceptsDocx(input: HTMLInputElement): boolean {
  const accept = input.accept.trim().toLowerCase()
  if (!accept) return true
  return accept
    .split(',')
    .map((token) => token.trim())
    .some(
      (token) =>
        token === '.docx' ||
        token === DOCX_TYPE ||
        token === '*/*' ||
        token === 'application/*' ||
        token === '*',
    )
}

/** Whether a file input's `accept` attribute allows a PDF. An empty `accept` allows anything. */
export function acceptsPdf(input: HTMLInputElement): boolean {
  const accept = input.accept.trim().toLowerCase()
  if (!accept) return true
  return accept
    .split(',')
    .map((token) => token.trim())
    .some(
      (token) =>
        token === '.pdf' ||
        token === 'application/pdf' ||
        token === '*/*' ||
        token === 'application/*' ||
        token === '*',
    )
}

export function toFile(file: TailoredFile): File {
  const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0))
  return new File([bytes], file.fileName, { type: file.mimeType ?? DOCX_TYPE })
}

export function attachFile(input: HTMLInputElement, file: File): void {
  const transfer = new DataTransfer()
  transfer.items.add(file)
  input.files = transfer.files
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

export function profileValues(profile: ApplicantProfile): Record<ProfileField, string> {
  const firstName = profile.firstName?.trim() ?? ''
  const lastName = profile.lastName?.trim() ?? ''
  return {
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(' '),
    email: profile.email?.trim() ?? '',
    phone: profile.phone?.trim() ?? '',
    location: profile.location?.trim() ?? '',
    linkedinUrl: profile.linkedinUrl?.trim() ?? '',
    websiteUrl: profile.websiteUrl?.trim() ?? '',
  }
}

function isEmpty(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox' || element.type === 'radio') {
      const group = element.name
        ? deepQueryAll<HTMLInputElement>(
            element.form ?? (element.getRootNode() as ParentNode),
            `input[name="${CSS.escape(element.name)}"]`,
          )
        : [element]
      return !group.some((item) => item.checked)
    }
    if (element.type === 'file') return (element.files?.length ?? 0) === 0
    return element.value.trim() === ''
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return element.value.trim() === ''
  }
  return false
}

/** Required inputs inside `root` that have no value. File inputs count even when hidden. */
export function findRequiredUnfilled(root: ParentNode): HTMLElement[] {
  const seenGroups = new Set<string>()
  const result: HTMLElement[] = []
  for (const element of deepQueryAll<HTMLElement>(
    root,
    'input[required], input[aria-required="true"], select[required], select[aria-required="true"], textarea[required], textarea[aria-required="true"]',
  )) {
    if (element instanceof HTMLInputElement && element.type === 'hidden') continue
    if ((element as HTMLInputElement).disabled) continue
    const isFile = element instanceof HTMLInputElement && element.type === 'file'
    if (!isFile && !isVisible(element)) continue
    if (element instanceof HTMLInputElement && element.type === 'radio' && element.name) {
      if (seenGroups.has(element.name)) continue
      seenGroups.add(element.name)
    }
    if (isEmpty(element)) result.push(element)
  }
  return result
}

/** The visible control to outline for a field (file inputs are usually hidden behind a button). */
function highlightTarget(element: HTMLElement): HTMLElement {
  if (isVisible(element)) return element
  return (
    element.closest<HTMLElement>('fieldset, [class*="field" i], [class*="upload" i], label') ??
    element.parentElement ??
    element
  )
}

function outline(element: HTMLElement, attribute: string, color: string, title?: string): void {
  const target = highlightTarget(element)
  target.setAttribute(attribute, 'true')
  target.style.setProperty('outline', `2px solid ${color}`, 'important')
  target.style.setProperty('outline-offset', '2px', 'important')
  if (title && !target.hasAttribute('title')) {
    target.setAttribute('title', title)
    target.setAttribute('data-cvspec-title', 'true')
  }
  if (attribute !== HIGHLIGHT_ATTR) return
  const clear = () => {
    target.removeAttribute(attribute)
    target.style.removeProperty('outline')
    target.style.removeProperty('outline-offset')
  }
  element.addEventListener('input', clear, { once: true })
  element.addEventListener('change', clear, { once: true })
}

export function highlight(elements: HTMLElement[]): void {
  for (const element of elements) outline(element, HIGHLIGHT_ATTR, NEEDS_INPUT_COLOR)
}

/** Outlines sensitive questions in their own colour. They stay outlined: CVSpec never fills them. */
export function highlightSensitive(questions: CustomQuestion[]): void {
  for (const question of questions) {
    for (const element of question.elements) {
      outline(
        element,
        SENSITIVE_ATTR,
        SENSITIVE_COLOR,
        'Answer this yourself. CVSpec never reads or stores this information.',
      )
    }
  }
}

export function clearHighlights(root: ParentNode = document): void {
  for (const element of deepQueryAll<HTMLElement>(
    root,
    `[${HIGHLIGHT_ATTR}], [${SENSITIVE_ATTR}]`,
  )) {
    element.removeAttribute(HIGHLIGHT_ATTR)
    element.removeAttribute(SENSITIVE_ATTR)
    element.style.removeProperty('outline')
    element.style.removeProperty('outline-offset')
    if (element.hasAttribute('data-cvspec-title')) {
      element.removeAttribute('title')
      element.removeAttribute('data-cvspec-title')
    }
  }
}

/** Selects an option in a native <select> by its text or value. */
function selectOption(select: HTMLSelectElement, choice: string): boolean {
  const wanted = choice.trim().toLowerCase()
  const option = Array.from(select.options).find(
    (item) => item.text.trim().toLowerCase() === wanted || item.value.toLowerCase() === wanted,
  )
  if (!option) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  if (setter) setter.call(select, option.value)
  else select.value = option.value
  select.dispatchEvent(new Event('input', { bubbles: true }))
  select.dispatchEvent(new Event('change', { bubbles: true }))
  select.dispatchEvent(new Event('blur', { bubbles: true }))
  return true
}

/** Ticks or unticks a radio or checkbox the way a click would, so frameworks see it. */
function setChecked(input: HTMLInputElement, checked: boolean): void {
  if (input.checked === checked) return
  input.click()
  if (input.checked !== checked) {
    input.checked = checked
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
}

/**
 * Sets a choice question. `choices` are option labels from `question.options` (for a single
 * checkbox, "Yes" or "No"). Returns false when an option could not be found.
 */
export function setChoice(
  question: Pick<CustomQuestion, 'kind' | 'options' | 'elements'>,
  choices: string[],
): boolean {
  if (choices.length === 0) return false
  if (question.kind === 'select') {
    const [select] = question.elements
    return select instanceof HTMLSelectElement && selectOption(select, choices[0])
  }
  const inputs = question.elements.filter(
    (element): element is HTMLInputElement => element instanceof HTMLInputElement,
  )
  if (question.kind === 'checkbox' && question.options.length === 0 && inputs.length === 1) {
    setChecked(inputs[0], /^yes$/i.test(choices[0]))
    return true
  }
  const wanted = new Set(choices.map((choice) => choice.trim().toLowerCase()))
  const matching = inputs.filter((input) => wanted.has(optionLabel(input).trim().toLowerCase()))
  if (matching.length === 0) return false
  if (question.kind === 'radio') {
    setChecked(matching[0], true)
    return true
  }
  for (const input of inputs) setChecked(input, matching.includes(input))
  return true
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Attaches the cover letter to the form's cover-letter upload (DOCX when accepted, else PDF), or
 * pastes it into the cover-letter box. Never touches the resume input or a box with text in it.
 */
async function addCoverLetter(
  adapter: ApplyFormAdapter,
  letter: CoverLetterSource,
  report: FillReport,
): Promise<void> {
  const text = letter.text.trim()
  if (!text) return

  const resume = adapter.resumeInput()
  const upload = adapter.coverLetterInput()
  if (upload && upload !== resume && (upload.files?.length ?? 0) === 0) {
    const format: CoverLetterFormat | null = acceptsDocx(upload)
      ? 'docx'
      : acceptsPdf(upload)
        ? 'pdf'
        : null
    if (!format) {
      report.coverLetterProblem =
        "This form's cover letter upload takes neither DOCX nor PDF. Download the letter from CVSpec and convert it."
    } else {
      try {
        const file = await letter.fetchFile(format)
        attachFile(upload, toFile(file))
        report.coverLetterFileName = file.fileName
        return
      } catch (err) {
        report.coverLetterProblem =
          err instanceof Error ? err.message : 'Could not build your cover letter'
      }
    }
  }

  const box = adapter.coverLetterTextarea()
  if (box && box.value.trim() === '') {
    setFieldValue(box, box.maxLength > 0 ? text.slice(0, box.maxLength) : text)
    report.coverLetterPasted = true
    report.coverLetterProblem = null
  }
}

/**
 * Attaches the tailored resume, then fills empty contact fields. Fields the page already has a
 * value for are kept, since forms like Lever prefill them from the uploaded resume.
 */
export async function fillForm(
  adapter: ApplyFormAdapter,
  pkg: Pick<ApplyPackage, 'profile' | 'file' | 'fileError'>,
  options: { settleMs?: number; coverLetter?: CoverLetterSource | null } = {},
): Promise<FillReport> {
  const { settleMs = 800, coverLetter = null } = options
  const report: FillReport = {
    filled: [],
    kept: [],
    fileName: null,
    fileProblem: pkg.fileError,
    unappliedEdits: pkg.file?.unapplied.length ?? 0,
    needsInput: 0,
    answered: 0,
    sensitive: 0,
    coverLetterFileName: null,
    coverLetterPasted: false,
    coverLetterProblem: null,
  }
  if (adapter.isSignIn?.()) return report

  const wizard = adapter.currentStep !== undefined
  if (pkg.file) {
    const input = adapter.resumeInput()
    if (!input) {
      // Wizard forms ask for the resume on one step only; the other steps have no upload.
      if (!wizard) {
        report.fileProblem =
          "Couldn't find the resume upload on this form. Attach the file yourself."
      }
    } else if (!acceptsDocx(input)) {
      report.fileProblem =
        'This form needs a PDF resume. Download the tailored resume, save it as PDF, and attach it.'
    } else {
      attachFile(input, toFile(pkg.file))
      report.fileName = pkg.file.fileName
      if (settleMs > 0) await delay(settleMs)
    }
  }

  if (coverLetter) await addCoverLetter(adapter, coverLetter, report)

  const values = profileValues(pkg.profile)
  const fields = adapter.fields()
  for (const key of Object.keys(fields) as ProfileField[]) {
    const field = fields[key]
    const value = values[key]
    if (!field || !value) continue
    if (field.value.trim() !== '') {
      report.kept.push(key)
      continue
    }
    setFieldValue(field, value)
    report.filled.push(key)
  }

  const confirm = findConfirmEmail(adapter.form() ?? document)
  if (confirm && values.email && confirm.value.trim() === '') setFieldValue(confirm, values.email)

  markForCandidate(adapter, report)
  return report
}

function findConfirmEmail(root: ParentNode): HTMLInputElement | null {
  return (
    deepQueryAll<HTMLInputElement>(root, 'input').find(
      (field) =>
        ['', 'text', 'email'].includes(field.type) &&
        !field.disabled &&
        !field.readOnly &&
        isVisible(field) &&
        CONFIRM_EMAIL.test(describe(field)),
    ) ?? null
  )
}

/** Outlines sensitive questions (purple) and required fields still empty (orange). */
export function markForCandidate(adapter: ApplyFormAdapter, report: FillReport): void {
  clearHighlights()
  const sensitive = adapter.questions().filter((question) => question.sensitive)
  highlightSensitive(sensitive)
  const sensitiveElements = new Set<HTMLElement>(sensitive.flatMap((question) => question.elements))
  const missing = adapter.requiredUnfilled().filter((element) => !sensitiveElements.has(element))
  highlight(missing)
  report.sensitive = sensitive.length
  report.needsInput = missing.length
}

export interface AnswerFillResult {
  answered: string[]
  /** Questions the page already had an answer for, left untouched. */
  kept: string[]
  /** Answers that matched no option on the form. */
  unmatched: string[]
}

const LISTBOX_WAIT_MS = 1500

/** The popup list a custom dropdown button opened: by aria-controls, else the visible listbox. */
function openListbox(button: HTMLElement): HTMLElement | null {
  const controls = button.getAttribute('aria-controls')
  if (controls) {
    const byId = (button.getRootNode() as Document | ShadowRoot).getElementById?.(controls)
    if (byId && isVisible(byId)) return byId as HTMLElement
  }
  const lists = deepQueryAll<HTMLElement>(document, '[role="listbox"]').filter(isVisible)
  return lists[lists.length - 1] ?? null
}

function closeListbox(button: HTMLElement): void {
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

/**
 * Opens a custom dropdown (Workday), picks the option the answer names and returns true. Closes
 * it again and returns false when no option matches, so the field can be highlighted instead.
 */
export async function chooseFromListbox(button: HTMLElement, answer: string): Promise<boolean> {
  button.click()
  const listbox = await waitFor(() => openListbox(button), LISTBOX_WAIT_MS)
  if (!listbox) return false
  const options = deepQueryAll<HTMLElement>(listbox, '[role="option"]')
  const labels = options.map((option) => option.textContent?.trim() ?? '')
  const [choice] = chosenOptions({ kind: 'select', options: labels }, answer)
  const option = choice ? options[labels.indexOf(choice)] : undefined
  if (!option) {
    closeListbox(button)
    return false
  }
  option.click()
  return true
}

/**
 * Fills reviewed answers into custom questions. Sensitive questions are never filled, whatever
 * `answers` holds, and answers the page already has are kept.
 */
export async function fillAnswers(
  questions: CustomQuestion[],
  answers: Map<string, string>,
): Promise<AnswerFillResult> {
  const result: AnswerFillResult = { answered: [], kept: [], unmatched: [] }
  for (const question of questions) {
    if (question.sensitive) continue
    const answer = answers.get(question.key)?.trim()
    if (!answer) continue
    if (isAnswered(question)) {
      result.kept.push(question.key)
      continue
    }
    if (question.listbox) {
      const [button] = question.elements
      if (button && (await chooseFromListbox(button, answer))) result.answered.push(question.key)
      else result.unmatched.push(question.key)
      continue
    }
    if (question.kind === 'text' || question.kind === 'textarea') {
      const [field] = question.elements
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        setFieldValue(field, question.maxLength ? answer.slice(0, question.maxLength) : answer)
        result.answered.push(question.key)
      }
      continue
    }
    const ok = setChoice(question, chosenOptions(question, answer))
    if (ok) result.answered.push(question.key)
    else result.unmatched.push(question.key)
  }
  return result
}
