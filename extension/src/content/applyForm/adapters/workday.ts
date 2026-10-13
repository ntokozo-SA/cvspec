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
import type { ApplyFormAdapter, ProfileField, TextField, WizardStep } from './types'

/** Steps that only hold employment-equity and self-identification questions. */
const SENSITIVE_STEP = /voluntary disclosure|self[\s-]?identi|disabilit|veteran|employment equity/i
const SENSITIVE_PAGE =
  '[data-automation-id*="voluntaryDisclosures" i], [data-automation-id*="selfIdentif" i]'

const SIGN_IN_PAGE = [
  '[data-automation-id="signInContent"]',
  '[data-automation-id="createAccountContent"]',
  '[data-automation-id="signInPage"]',
  '[data-automation-id="createAccountPage"]',
].join(', ')

/** Workday's custom dropdowns: a button that opens a listbox popup. */
const LISTBOX = 'button[aria-haspopup="listbox"]'
/** Address and phone dropdowns are the candidate's to pick, not questions to draft. */
const CONTACT_DROPDOWNS =
  '[data-automation-id*="country" i], [data-automation-id*="phone" i], [data-automation-id*="region" i], [data-automation-id*="address" i]'

const FIELD_SELECTORS: Array<[ProfileField, string]> = [
  [
    'firstName',
    'input[data-automation-id="legalNameSection_firstName"], input[name="legalName--firstName"]',
  ],
  [
    'lastName',
    'input[data-automation-id="legalNameSection_lastName"], input[name="legalName--lastName"]',
  ],
  ['email', 'input[data-automation-id="email"], input[name="email"]'],
  [
    'phone',
    'input[data-automation-id="phone-number"], input[name="phoneNumber--phoneNumber"]',
  ],
  ['location', 'input[data-automation-id="addressSection_city"], input[name="address--city"]'],
  ['linkedinUrl', 'input[data-automation-id="linkedinQuestion"], input[name="linkedInAccount"]'],
]

function root(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('[data-automation-id="applyFlowPage"]') ??
    document.querySelector<HTMLElement>('[data-automation-id="applyFlowPageContainer"]') ??
    null
  )
}

function isSignIn(): boolean {
  if (document.querySelector(SIGN_IN_PAGE)) return true
  return deepQueryAll<HTMLInputElement>(document, 'input[type="password"]').some(isVisible)
}

function currentStep(): WizardStep | null {
  const steps = Array.from(
    document.querySelectorAll<HTMLElement>('[data-automation-id="progressBar"] > li'),
  )
  if (steps.length === 0) return null
  const active = steps.findIndex(
    (step) =>
      step.getAttribute('data-automation-id') === 'progressBarActiveStep' ||
      step.getAttribute('aria-current') === 'step',
  )
  if (active < 0) return null
  const step = steps[active]
  const name =
    step.querySelector('label')?.textContent?.trim() ||
    (step.textContent ?? '').replace(/current step \d+ of \d+/i, '').trim()
  return { index: active + 1, total: steps.length, name }
}

function isSensitiveStep(): boolean {
  if (SENSITIVE_STEP.test(currentStep()?.name ?? '')) return true
  return root()?.querySelector(SENSITIVE_PAGE) != null
}

/** Nothing is filled on sign-in pages or on the voluntary disclosure steps. */
function fillable(): HTMLElement | null {
  if (isSignIn() || isSensitiveStep()) return null
  return root()
}

function fields(): Partial<Record<ProfileField, TextField>> {
  const scope = fillable()
  if (!scope) return {}
  const result = matchFields(scope)
  for (const [key, selector] of FIELD_SELECTORS) {
    const field = deepQuery<HTMLInputElement>(scope, selector)
    if (field && isVisible(field) && !field.disabled) result[key] = field
  }
  if (result.firstName && result.lastName) delete result.fullName
  return result
}

function resumeInput(): HTMLInputElement | null {
  const scope = fillable()
  if (!scope) return null
  return (
    scope.querySelector<HTMLInputElement>(
      'input[type="file"][data-automation-id="file-upload-input-ref"]',
    ) ?? findResumeInput(scope)
  )
}

function coverLetterTextarea(): HTMLTextAreaElement | null {
  const scope = fillable()
  return scope ? findCoverLetterTextarea(scope) : null
}

export const workdayAdapter: ApplyFormAdapter = {
  system: 'workday',
  matches(url) {
    return APPLY_SITES.workday.host.test(url.hostname)
  },
  form: root,
  isReady() {
    return isSignIn() || (root() !== null && currentStep() !== null)
  },
  currentStep,
  isSignIn,
  resumeInput,
  coverLetterInput() {
    const scope = fillable()
    return scope ? findCoverLetterInput(scope, resumeInput()) : null
  },
  coverLetterTextarea,
  fields,
  questions() {
    const scope = root()
    if (!scope || isSignIn()) return []
    const contactDropdowns = Array.from(scope.querySelectorAll(CONTACT_DROPDOWNS)).flatMap(
      (container) => Array.from(container.querySelectorAll(LISTBOX)),
    )
    return collectQuestions(
      scope,
      'workday',
      [...Object.values(fields()), coverLetterTextarea() ?? undefined, ...contactDropdowns],
      { listboxSelector: LISTBOX, allSensitive: isSensitiveStep() },
    )
  },
  requiredUnfilled() {
    const scope = root()
    return scope && !isSignIn() ? findRequiredUnfilled(scope) : []
  },
  isConfirmation() {
    return (
      document.querySelector('[data-automation-id="congratulationsPopup"]') !== null ||
      pageShowsConfirmation()
    )
  },
}
