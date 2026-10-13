import { isSensitiveQuestion } from '../../../shared/sensitive'
import { deepQueryAll } from '../dom'
import { findRequiredUnfilled, isVisible } from '../fill'
import { collectQuestions } from '../questions'
import { CONFIRM_EMAIL, describe } from './labels'
import type { ApplyFormAdapter, ProfileField, TextField } from './types'

export { describe, deepQueryAll }

const TEXT_TYPES = new Set(['', 'text', 'email', 'tel', 'url', 'search'])

/** Fields about other people (referrers, references, emergency contacts) are never filled. */
const OTHER_PERSON = /\b(?:refer|emergency|manager|supervisor|recruiter)/i

/** "Confirm email" boxes: filled with the email, never treated as the email field itself. */
export function findConfirmEmailInput(root: ParentNode): HTMLInputElement | null {
  return (
    deepQueryAll<HTMLInputElement>(root, 'input').find(
      (field) =>
        isFillableText(field) && field instanceof HTMLInputElement && CONFIRM_EMAIL.test(describe(field)),
    ) ?? null
  )
}

const RULES: Array<{ field: ProfileField; test: (field: TextField, text: string) => boolean }> = [
  {
    field: 'email',
    test: (field, text) =>
      (field instanceof HTMLInputElement && field.type === 'email') ||
      field.autocomplete === 'email' ||
      /\be-?mail\b/.test(text),
  },
  {
    field: 'phone',
    test: (field, text) =>
      (field instanceof HTMLInputElement && field.type === 'tel') ||
      field.autocomplete.startsWith('tel') ||
      /\b(?:phone|mobile|cell|telephone)\b/.test(text),
  },
  { field: 'linkedinUrl', test: (_field, text) => /linked\s*in/.test(text) },
  {
    field: 'websiteUrl',
    test: (_field, text) => /\b(?:website|portfolio|personal (?:site|url)|homepage)\b/.test(text),
  },
  {
    field: 'firstName',
    test: (field, text) =>
      field.autocomplete === 'given-name' ||
      /\b(?:first|given|fore)[\s_-]?name\b|\bfname\b|\bfirstname\b/.test(text),
  },
  {
    field: 'lastName',
    test: (field, text) =>
      field.autocomplete === 'family-name' ||
      /\b(?:last|family|sur)[\s_-]?name\b|\blname\b|\blastname\b|\bsurname\b/.test(text),
  },
  {
    field: 'fullName',
    test: (field, text) =>
      field.autocomplete === 'name' ||
      /^(?:full |your |candidate )?name\b/.test(text) ||
      /\bfull[\s_-]?name\b/.test(text),
  },
  {
    field: 'location',
    test: (field, text) =>
      field.autocomplete === 'address-level2' ||
      (/\b(?:location|city|current location)\b/.test(text) && !/relocat/.test(text)),
  },
]

function isFillableText(element: Element): element is TextField {
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly
  if (!(element instanceof HTMLInputElement)) return false
  if (!TEXT_TYPES.has(element.type) || element.disabled || element.readOnly) return false
  if (element.getAttribute('role') === 'combobox') return false
  return isVisible(element)
}

/** Matches contact fields by autocomplete, type, label, placeholder, name and id. */
export function matchFields(root: ParentNode): Partial<Record<ProfileField, TextField>> {
  const result: Partial<Record<ProfileField, TextField>> = {}
  const used = new Set<TextField>()
  const candidates = deepQueryAll(root, 'input, textarea')
    .filter(isFillableText)
    .map((field) => ({ field, text: describe(field) }))
    .filter(
      ({ text }) =>
        !OTHER_PERSON.test(text) && !isSensitiveQuestion(text) && !CONFIRM_EMAIL.test(text),
    )

  for (const rule of RULES) {
    if (result[rule.field]) continue
    const match = candidates.find(({ field, text }) => !used.has(field) && rule.test(field, text))
    if (match) {
      result[rule.field] = match.field
      used.add(match.field)
    }
  }
  if (result.firstName && result.lastName) delete result.fullName
  return result
}

/** The resume file input: one labelled resume or CV, else the only non cover-letter file input. */
export function findResumeInput(root: ParentNode): HTMLInputElement | null {
  const inputs = deepQueryAll<HTMLInputElement>(root, 'input[type="file"]').filter(
    (input) => !input.disabled,
  )
  const described = inputs.map((input) => ({ input, text: describe(input) }))
  const labelled = described.find(({ text }) => /\b(?:resume|résumé|cv|curriculum)\b/.test(text))
  if (labelled) return labelled.input
  const others = described.filter(({ text }) => !/cover/.test(text))
  return others.length === 1 ? others[0].input : null
}

const COVER_LETTER = /\bcover(?:ing)?[\s_-]?letter\b/

/** A file input described as a cover letter, never the resume input. */
export function findCoverLetterInput(
  root: ParentNode,
  resume: HTMLInputElement | null,
): HTMLInputElement | null {
  return (
    deepQueryAll<HTMLInputElement>(root, 'input[type="file"]').find(
      (input) => !input.disabled && input !== resume && /\bcover/.test(describe(input)),
    ) ?? null
  )
}

/** A visible, editable text box described as a cover letter. */
export function findCoverLetterTextarea(root: ParentNode): HTMLTextAreaElement | null {
  return (
    deepQueryAll<HTMLTextAreaElement>(root, 'textarea').find(
      (box) =>
        !box.disabled && !box.readOnly && isVisible(box) && COVER_LETTER.test(describe(box)),
    ) ?? null
  )
}

/** The form most likely to be the application: has a file input or an email field. */
export function findApplicationForm(): HTMLFormElement | null {
  const forms = Array.from(document.querySelectorAll('form'))
  const scored = forms
    .map((form) => ({
      form,
      score:
        (form.querySelector('input[type="file"]') ? 2 : 0) +
        (form.querySelector('input[type="email"], input[name*="email" i]') ? 1 : 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.form ?? null
}

const CONFIRMATION_TEXT =
  /thank(?:s| you) for (?:your )?appl|application (?:has been |was )?(?:submitted|received)|we(?:'ve| have) received your application/i

export function pageShowsConfirmation(): boolean {
  for (const heading of deepQueryAll<HTMLElement>(
    document,
    'h1, h2, h3, [role="heading"], [role="alert"]',
  )) {
    if (CONFIRMATION_TEXT.test(heading.textContent ?? '')) return true
  }
  return false
}

export const genericFormAdapter: ApplyFormAdapter = {
  system: 'generic',
  matches() {
    return true
  },
  form: findApplicationForm,
  isReady() {
    return findApplicationForm() !== null
  },
  resumeInput() {
    return findResumeInput(findApplicationForm() ?? document)
  },
  coverLetterInput() {
    const root = findApplicationForm() ?? document
    return findCoverLetterInput(root, findResumeInput(root))
  },
  coverLetterTextarea() {
    return findCoverLetterTextarea(findApplicationForm() ?? document)
  },
  fields() {
    return matchFields(findApplicationForm() ?? document)
  },
  requiredUnfilled() {
    return findRequiredUnfilled(findApplicationForm() ?? document)
  },
  questions() {
    const root = findApplicationForm() ?? document
    return collectQuestions(root, 'generic', [
      ...Object.values(matchFields(root)),
      findCoverLetterTextarea(root) ?? undefined,
    ])
  },
  isConfirmation: pageShowsConfirmation,
}
