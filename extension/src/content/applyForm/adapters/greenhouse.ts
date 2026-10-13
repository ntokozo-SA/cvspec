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

const HOST = /^(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io$/

const FORM = [
  'form#application_form',
  'form#application-form',
  'form[action*="/applications"]',
  'form[class*="application" i]',
]

const RESUME = [
  'input[type="file"]#resume',
  'input[type="file"][name*="resume" i]',
  'input[type="file"][id*="resume" i]',
]

const FIELD_IDS: Partial<Record<ProfileField, string>> = {
  firstName: 'first_name',
  lastName: 'last_name',
  email: 'email',
  phone: 'phone',
}

function form(): HTMLFormElement | null {
  for (const selector of FORM) {
    const found = document.querySelector<HTMLFormElement>(selector)
    if (found) return found
  }
  return document.getElementById('first_name')?.closest('form') ?? null
}

function byId(root: ParentNode, id: string): TextField | null {
  const element = root.querySelector(`#${CSS.escape(id)}`)
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
    ? element
    : null
}

function fields(): Partial<Record<ProfileField, TextField>> {
  const root = form() ?? document
  const result = matchFields(root)
  for (const [key, id] of Object.entries(FIELD_IDS) as Array<[ProfileField, string]>) {
    const field = byId(root, id)
    if (field) result[key] = field
  }
  if (result.firstName && result.lastName) delete result.fullName
  return result
}

function resumeInput(): HTMLInputElement | null {
  const root = form() ?? document
  for (const selector of RESUME) {
    const input = root.querySelector<HTMLInputElement>(selector)
    if (input) return input
  }
  return findResumeInput(root)
}

/** Greenhouse's "enter manually" cover letter box, when the board offers one. */
function coverLetterTextarea(): HTMLTextAreaElement | null {
  const root = form() ?? document
  const box = root.querySelector<HTMLTextAreaElement>(
    'textarea#cover_letter_text, textarea[name*="cover_letter_text" i]',
  )
  return box && !box.disabled && isVisible(box) ? box : findCoverLetterTextarea(root)
}

export const greenhouseAdapter: ApplyFormAdapter = {
  system: 'greenhouse',
  matches(url) {
    return HOST.test(url.hostname)
  },
  form,
  isReady() {
    const root = form()
    return root !== null && (byId(root, 'first_name') !== null || byId(root, 'email') !== null)
  },
  resumeInput,
  coverLetterInput() {
    const root = form() ?? document
    const resume = resumeInput()
    const input =
      root.querySelector<HTMLInputElement>('input[type="file"]#cover_letter') ??
      root.querySelector<HTMLInputElement>('input[type="file"][name*="cover_letter" i]')
    return input && input !== resume ? input : findCoverLetterInput(root, resume)
  },
  coverLetterTextarea,
  fields,
  questions() {
    return collectQuestions(form() ?? document, 'greenhouse', [
      ...Object.values(fields()),
      coverLetterTextarea() ?? undefined,
    ])
  },
  requiredUnfilled() {
    return findRequiredUnfilled(form() ?? document)
  },
  isConfirmation() {
    return (
      /\/confirmation\b/.test(window.location.pathname) ||
      document.querySelector('#application_confirmation, [data-testid*="confirmation" i]') !==
        null ||
      pageShowsConfirmation()
    )
  },
}
