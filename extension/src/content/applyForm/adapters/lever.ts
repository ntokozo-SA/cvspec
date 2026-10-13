import { findRequiredUnfilled, isVisible } from '../fill'
import { collectQuestions } from '../questions'
import {
  findCoverLetterInput,
  findCoverLetterTextarea,
  findResumeInput,
  matchFields,
  pageShowsConfirmation,
} from './generic'
import type { ApplyFormAdapter, ProfileField, TextField } from './types'

const HOST = /^jobs(?:\.eu)?\.lever\.co$/

/** Lever uses one full-name field and named URL fields such as `urls[LinkedIn]`. */
const FIELD_NAMES: Array<[ProfileField, string[]]> = [
  ['fullName', ['name']],
  ['email', ['email']],
  ['phone', ['phone']],
  ['location', ['location']],
  ['linkedinUrl', ['urls[LinkedIn]', 'urls[Linkedin]']],
  ['websiteUrl', ['urls[Portfolio]', 'urls[Website]', 'urls[Other]']],
]

function form(): HTMLFormElement | null {
  return (
    document.querySelector<HTMLFormElement>('form#application-form') ??
    document.querySelector<HTMLFormElement>('form[action$="/apply"]') ??
    document.querySelector<HTMLInputElement>('input[name="resume"]')?.closest('form') ??
    null
  )
}

function byName(root: ParentNode, name: string): TextField | null {
  const element = root.querySelector(`[name="${CSS.escape(name)}"]`)
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
    ? element
    : null
}

function fields(): Partial<Record<ProfileField, TextField>> {
  const root = form() ?? document
  const result = matchFields(root)
  for (const [key, names] of FIELD_NAMES) {
    const field = names.map((name) => byName(root, name)).find(Boolean)
    if (field) result[key] = field
  }
  delete result.firstName
  delete result.lastName
  return result
}

function resumeInput(): HTMLInputElement | null {
  const root = form() ?? document
  return (
    root.querySelector<HTMLInputElement>('#resume-upload-input') ??
    root.querySelector<HTMLInputElement>('input[type="file"][name="resume"]') ??
    findResumeInput(root)
  )
}

/** Lever has no cover-letter upload; its "Additional information" box is where letters go. */
function coverLetterTextarea(): HTMLTextAreaElement | null {
  const root = form() ?? document
  const box = root.querySelector<HTMLTextAreaElement>('textarea[name="comments"]')
  return box && !box.disabled && !box.readOnly && isVisible(box)
    ? box
    : findCoverLetterTextarea(root)
}

export const leverAdapter: ApplyFormAdapter = {
  system: 'lever',
  matches(url) {
    return HOST.test(url.hostname)
  },
  form,
  isReady() {
    const root = form()
    return root !== null && byName(root, 'email') !== null
  },
  resumeInput,
  coverLetterInput() {
    return findCoverLetterInput(form() ?? document, resumeInput())
  },
  coverLetterTextarea,
  fields,
  questions() {
    return collectQuestions(form() ?? document, 'lever', [
      ...Object.values(fields()),
      coverLetterTextarea() ?? undefined,
    ])
  },
  requiredUnfilled() {
    return findRequiredUnfilled(form() ?? document)
  },
  isConfirmation() {
    return /\/thanks\/?$/.test(window.location.pathname) || pageShowsConfirmation()
  },
}
