import { APPLY_SITES } from '../../../shared/sites'
import { isVisible } from '../dom'
import { findRequiredUnfilled } from '../fill'
import { collectQuestions } from '../questions'
import {
  findApplicationForm,
  findCoverLetterInput,
  findCoverLetterTextarea,
  findResumeInput,
  matchFields,
  pageShowsConfirmation,
} from './generic'
import type { ApplyFormAdapter, ProfileField, TextField } from './types'

/** Workable marks fields with `data-ui`: `firstname`, `email`, and `QA_<id>` for questions. */
const FIELD_NAMES: Array<[ProfileField, string]> = [
  ['firstName', 'firstname'],
  ['lastName', 'lastname'],
  ['email', 'email'],
  ['phone', 'phone'],
  ['location', 'address'],
]

function form(): HTMLElement | null {
  return document.querySelector<HTMLFormElement>('form[data-ui="application-form"]') ?? findApplicationForm()
}

function scope(): ParentNode {
  return form() ?? document
}

function named(root: ParentNode, name: string): TextField | null {
  const field = root.querySelector(`[data-ui="${name}"], [name="${name}"]`)
  const control =
    field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
      ? field
      : field?.querySelector('input, textarea')
  return control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
    ? control
    : null
}

function fields(): Partial<Record<ProfileField, TextField>> {
  const root = scope()
  const result = matchFields(root)
  for (const [key, name] of FIELD_NAMES) {
    const field = named(root, name)
    if (field && isVisible(field) && !field.disabled) result[key] = field
  }
  if (result.firstName && result.lastName) delete result.fullName
  return result
}

function resumeInput(): HTMLInputElement | null {
  const root = scope()
  return (
    root.querySelector<HTMLInputElement>(
      'input[type="file"][data-ui="resume"], input[type="file"][name="resume"]',
    ) ?? findResumeInput(root)
  )
}

function coverLetterTextarea(): HTMLTextAreaElement | null {
  const root = scope()
  const box = root.querySelector<HTMLTextAreaElement>(
    'textarea[data-ui="cover_letter"], textarea[name="cover_letter"]',
  )
  return box && !box.disabled && isVisible(box) ? box : findCoverLetterTextarea(root)
}

export const workableAdapter: ApplyFormAdapter = {
  system: 'workable',
  matches(url) {
    return APPLY_SITES.workable.host.test(url.hostname)
  },
  form,
  isReady() {
    const root = form()
    return root !== null && named(root, 'email') !== null
  },
  resumeInput,
  coverLetterInput() {
    const root = scope()
    const resume = resumeInput()
    const upload = root.querySelector<HTMLInputElement>(
      'input[type="file"][data-ui="cover_letter"], input[type="file"][name="cover_letter"]',
    )
    return upload && upload !== resume ? upload : findCoverLetterInput(root, resume)
  },
  coverLetterTextarea,
  fields,
  questions() {
    return collectQuestions(scope(), 'workable', [
      ...Object.values(fields()),
      coverLetterTextarea() ?? undefined,
    ])
  },
  requiredUnfilled() {
    return findRequiredUnfilled(scope())
  },
  isConfirmation() {
    return (
      document.querySelector('[data-ui="application-submitted"], [data-ui="success"]') !== null ||
      /\/(?:success|thank-?you)\/?$/.test(window.location.pathname) ||
      pageShowsConfirmation()
    )
  },
}
