import { APPLY_SITES } from '../../../shared/sites'
import { deepQueryAll, isVisible } from '../dom'
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

/**
 * SAP SuccessFactors career sites. UI5 gives fields generated ids (`__input12-inner`), so every
 * field is found through its label rather than by id.
 */
function form(): HTMLElement | null {
  return (
    document.querySelector<HTMLFormElement>('form#careerForm, form[name="careerForm"]') ??
    findApplicationForm() ??
    document.querySelector<HTMLElement>('[id*="applyForm" i], [id*="applicationForm" i]')
  )
}

function isSignIn(): boolean {
  return deepQueryAll<HTMLInputElement>(document, 'input[type="password"]').some(isVisible)
}

function scope(): ParentNode | null {
  if (isSignIn()) return null
  return form()
}

function fields(): Partial<Record<ProfileField, TextField>> {
  const root = scope()
  return root ? matchFields(root) : {}
}

function resumeInput(): HTMLInputElement | null {
  const root = scope()
  return root ? findResumeInput(root) : null
}

function coverLetterTextarea(): HTMLTextAreaElement | null {
  const root = scope()
  return root ? findCoverLetterTextarea(root) : null
}

export const successFactorsAdapter: ApplyFormAdapter = {
  system: 'successfactors',
  matches(url) {
    return APPLY_SITES.successfactors.host.test(url.hostname)
  },
  form,
  isReady() {
    if (isSignIn()) return true
    const root = form()
    return (
      root !== null &&
      root.querySelector('input[type="email"], input[type="file"], input[name*="email" i]') !== null
    )
  },
  isSignIn,
  resumeInput,
  coverLetterInput() {
    const root = scope()
    return root ? findCoverLetterInput(root, resumeInput()) : null
  },
  coverLetterTextarea,
  fields,
  questions() {
    const root = scope()
    if (!root) return []
    return collectQuestions(root, 'successfactors', [
      ...Object.values(fields()),
      coverLetterTextarea() ?? undefined,
    ])
  },
  requiredUnfilled() {
    const root = scope()
    return root ? findRequiredUnfilled(root) : []
  },
  isConfirmation: pageShowsConfirmation,
}
