import { findRequiredUnfilled } from '../fill'
import { findResumeInput, matchFields, pageShowsConfirmation } from './generic'
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
  resumeInput() {
    const root = form() ?? document
    return (
      root.querySelector<HTMLInputElement>('#resume-upload-input') ??
      root.querySelector<HTMLInputElement>('input[type="file"][name="resume"]') ??
      findResumeInput(root)
    )
  },
  fields() {
    const root = form() ?? document
    const fields = matchFields(root)
    for (const [key, names] of FIELD_NAMES) {
      const field = names.map((name) => byName(root, name)).find(Boolean)
      if (field) fields[key] = field
    }
    delete fields.firstName
    delete fields.lastName
    return fields
  },
  requiredUnfilled() {
    return findRequiredUnfilled(form() ?? document)
  },
  isConfirmation() {
    return /\/thanks\/?$/.test(window.location.pathname) || pageShowsConfirmation()
  },
}
