import type { ApplicantProfile, ApplyPackage, TailoredFile } from '../../shared/types'
import type { ApplyFormAdapter, ProfileField, TextField } from './adapters/types'

export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const HIGHLIGHT_ATTR = 'data-cvspec-needs-input'

export interface FillReport {
  filled: ProfileField[]
  /** Fields the page already had a value for, left untouched. */
  kept: ProfileField[]
  fileName: string | null
  /** Why the resume was not attached, if it was not. */
  fileProblem: string | null
  unappliedEdits: number
  needsInput: number
}

export function isVisible(element: Element): boolean {
  return element.getClientRects().length > 0
}

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

export function toFile(file: TailoredFile): File {
  const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0))
  return new File([bytes], file.fileName, { type: DOCX_TYPE })
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
        ? Array.from(
            (element.form ?? document).querySelectorAll<HTMLInputElement>(
              `input[name="${CSS.escape(element.name)}"]`,
            ),
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
  for (const element of Array.from(
    root.querySelectorAll<HTMLElement>(
      'input[required], input[aria-required="true"], select[required], select[aria-required="true"], textarea[required], textarea[aria-required="true"]',
    ),
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

export function highlight(elements: HTMLElement[]): void {
  for (const element of elements) {
    const target = highlightTarget(element)
    target.setAttribute(HIGHLIGHT_ATTR, 'true')
    target.style.setProperty('outline', '2px solid #b7791f', 'important')
    target.style.setProperty('outline-offset', '2px', 'important')
    const clear = () => {
      target.removeAttribute(HIGHLIGHT_ATTR)
      target.style.removeProperty('outline')
      target.style.removeProperty('outline-offset')
    }
    element.addEventListener('input', clear, { once: true })
    element.addEventListener('change', clear, { once: true })
  }
}

export function clearHighlights(root: ParentNode = document): void {
  for (const element of Array.from(root.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_ATTR}]`))) {
    element.removeAttribute(HIGHLIGHT_ATTR)
    element.style.removeProperty('outline')
    element.style.removeProperty('outline-offset')
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Attaches the tailored resume, then fills empty contact fields. Fields the page already has a
 * value for are kept, since forms like Lever prefill them from the uploaded resume.
 */
export async function fillForm(
  adapter: ApplyFormAdapter,
  pkg: Pick<ApplyPackage, 'profile' | 'file' | 'fileError'>,
  options: { settleMs?: number } = {},
): Promise<FillReport> {
  const { settleMs = 800 } = options
  const report: FillReport = {
    filled: [],
    kept: [],
    fileName: null,
    fileProblem: pkg.fileError,
    unappliedEdits: pkg.file?.unapplied.length ?? 0,
    needsInput: 0,
  }

  if (pkg.file) {
    const input = adapter.resumeInput()
    if (!input) {
      report.fileProblem = "Couldn't find the resume upload on this form. Attach the file yourself."
    } else if (!acceptsDocx(input)) {
      report.fileProblem =
        'This form needs a PDF resume. Download the tailored resume, save it as PDF, and attach it.'
    } else {
      attachFile(input, toFile(pkg.file))
      report.fileName = pkg.file.fileName
      if (settleMs > 0) await delay(settleMs)
    }
  }

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

  clearHighlights()
  const missing = adapter.requiredUnfilled()
  highlight(missing)
  report.needsInput = missing.length
  return report
}
