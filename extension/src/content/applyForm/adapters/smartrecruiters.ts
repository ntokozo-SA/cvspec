import { APPLY_SITES } from '../../../shared/sites'
import { deepQuery, deepQueryAll, isVisible } from '../dom'
import { findRequiredUnfilled } from '../fill'
import { collectQuestions } from '../questions'
import {
  findCoverLetterInput,
  findCoverLetterTextarea,
  findResumeInput,
  matchFields,
  pageShowsConfirmation,
} from './generic'
import type { ApplyFormAdapter, ProfileField, TextField } from './types'

/** SmartRecruiters' one-click form renders inside web components with open shadow roots. */
const FIELD_IDS: Array<[ProfileField, string]> = [
  ['firstName', 'first-name-input'],
  ['lastName', 'last-name-input'],
  ['email', 'email-input'],
  ['phone', 'phone-number-input'],
  ['location', 'location-input'],
  ['linkedinUrl', 'linkedin-input'],
  ['websiteUrl', 'website-input'],
]

function form(): HTMLElement | null {
  const forms = deepQueryAll<HTMLFormElement>(document, 'form')
  return (
    forms.find((candidate) => deepQuery(candidate, 'input[type="email"], #email-input')) ??
    deepQuery<HTMLElement>(document, 'oc-oneclick-form') ??
    null
  )
}

function scope(): ParentNode {
  return form() ?? document
}

function fields(): Partial<Record<ProfileField, TextField>> {
  const root = scope()
  const result = matchFields(root)
  for (const [key, id] of FIELD_IDS) {
    const field = deepQuery<HTMLInputElement>(root, `#${id}`)
    if (field && isVisible(field) && !field.disabled) result[key] = field
  }
  if (result.firstName && result.lastName) delete result.fullName
  return result
}

function resumeInput(): HTMLInputElement | null {
  const root = scope()
  return (
    deepQuery<HTMLInputElement>(root, 'input[type="file"][data-test*="resume" i]') ??
    findResumeInput(root)
  )
}

function coverLetterTextarea(): HTMLTextAreaElement | null {
  return findCoverLetterTextarea(scope())
}

export const smartRecruitersAdapter: ApplyFormAdapter = {
  system: 'smartrecruiters',
  matches(url) {
    return APPLY_SITES.smartrecruiters.host.test(url.hostname)
  },
  form,
  isReady() {
    const root = form()
    return root !== null && deepQuery(root, '#email-input, input[type="email"]') !== null
  },
  resumeInput,
  coverLetterInput() {
    return findCoverLetterInput(scope(), resumeInput())
  },
  coverLetterTextarea,
  fields,
  questions() {
    return collectQuestions(scope(), 'smartrecruiters', [
      ...Object.values(fields()),
      coverLetterTextarea() ?? undefined,
    ])
  },
  requiredUnfilled() {
    return findRequiredUnfilled(scope())
  },
  isConfirmation() {
    return /\/(?:confirmation|thank-?you|success)\b/i.test(window.location.pathname) ||
      pageShowsConfirmation()
  },
}
