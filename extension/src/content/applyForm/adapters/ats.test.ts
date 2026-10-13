import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ApplicantProfile, TailoredFile } from '../../../shared/types'
import { attachShadows, emulateListboxes } from '../../../test/dom'
import smartRecruitersHtml from '../__fixtures__/smartrecruiters.html?raw'
import successFactorsHtml from '../__fixtures__/successfactors.html?raw'
import workableHtml from '../__fixtures__/workable.html?raw'
import workdayExperienceHtml from '../__fixtures__/workday-experience.html?raw'
import workdayInfoHtml from '../__fixtures__/workday-my-information.html?raw'
import workdayQuestionsHtml from '../__fixtures__/workday-questions.html?raw'
import workdaySignInHtml from '../__fixtures__/workday-sign-in.html?raw'
import workdayVoluntaryHtml from '../__fixtures__/workday-voluntary.html?raw'
import { deepQuery } from '../dom'
import { chooseFromListbox, fillAnswers, fillForm, SENSITIVE_ATTR } from '../fill'
import { listboxValue } from '../questions'
import { findApplyFormAdapter } from './index'
import { smartRecruitersAdapter } from './smartrecruiters'
import { successFactorsAdapter } from './successfactors'
import { workableAdapter } from './workable'
import { workdayAdapter } from './workday'

const START_PATH = window.location.pathname

const profile: ApplicantProfile = {
  firstName: 'Thandi',
  lastName: 'Nkosi',
  email: 'thandi@example.co.za',
  phone: '+27 82 123 4567',
  location: 'Johannesburg',
  linkedinUrl: 'https://www.linkedin.com/in/thandi',
  websiteUrl: null,
  updatedAt: null,
  saved: true,
}

const file: TailoredFile = { base64: btoa('PK docx'), fileName: 'Thandi-CV.docx', unapplied: [] }
const pkg = { profile, file, fileError: null }

function load(html: string): void {
  document.body.innerHTML = html
  attachShadows()
}

function byId<T extends HTMLElement = HTMLInputElement>(id: string): T {
  const element = deepQuery<T>(document, `#${CSS.escape(id)}`)
  if (!element) throw new Error(`Missing #${id}`)
  return element
}

let stopListboxes = () => {}
const nextClicks: string[] = []
const onClick = (event: Event) => {
  const target = (event.target as Element | null)?.closest('button')
  if (target && /next|continue|sign in|submit|apply/i.test(target.textContent ?? '')) {
    nextClicks.push(target.textContent?.trim() ?? '')
  }
}

beforeEach(() => {
  stopListboxes = emulateListboxes()
  nextClicks.length = 0
  document.addEventListener('click', onClick, true)
})

afterEach(() => {
  stopListboxes()
  document.removeEventListener('click', onClick, true)
  document.body.innerHTML = ''
  window.history.replaceState({}, '', START_PATH)
})

describe('findApplyFormAdapter for SA employers', () => {
  it.each([
    ['https://jobs.smartrecruiters.com/StandardBankGroup/7442-graduate-analyst', 'smartrecruiters'],
    ['https://absa.wd3.myworkdayjobs.com/en-US/ABSAcareersite/job/apply', 'workday'],
    ['https://firstrand.wd3.myworkdaysite.com/recruiting/firstrand/FNB/job/1', 'workday'],
    ['https://career5.successfactors.eu/careers?company=nedbank', 'successfactors'],
    ['https://apply.workable.com/acme/j/ABC123/apply/', 'workable'],
  ])('%s uses the %s adapter', (url, system) => {
    expect(findApplyFormAdapter(new URL(url)).system).toBe(system)
  })
})

describe('smartRecruitersAdapter (shadow DOM)', () => {
  it('finds fields inside nested shadow roots', () => {
    load(smartRecruitersHtml)

    expect(smartRecruitersAdapter.isReady()).toBe(true)
    const fields = smartRecruitersAdapter.fields()
    expect(fields.firstName?.id).toBe('first-name-input')
    expect(fields.lastName?.id).toBe('last-name-input')
    expect(fields.email?.id).toBe('email-input')
    expect(fields.phone?.id).toBe('phone-number-input')
    expect(fields.location?.id).toBe('location-input')
    expect(fields.linkedinUrl?.id).toBe('linkedin-input')
    expect(smartRecruitersAdapter.resumeInput()?.id).toBe('resume-upload')
  })

  it('collects screening questions and flags the ID number', () => {
    load(smartRecruitersHtml)
    const questions = smartRecruitersAdapter.questions()
    const labels = questions.map((question) => question.label)

    expect(labels).toContain('Why do you want to work at Standard Bank?')
    expect(labels).toContain('Do you have a matric certificate?')
    expect(labels.some((label) => /confirm/i.test(label))).toBe(false)
    const id = questions.find((question) => /ID number/i.test(question.label))
    expect(id?.sensitive).toBe(true)
  })

  it('fills shadow fields and the confirm-email box', async () => {
    load(smartRecruitersHtml)
    const report = await fillForm(smartRecruitersAdapter, pkg, { settleMs: 0 })

    expect(report.fileName).toBe('Thandi-CV.docx')
    expect(byId('first-name-input').value).toBe('Thandi')
    expect(byId('email-input').value).toBe('thandi@example.co.za')
    expect(byId('confirm-email-input').value).toBe('thandi@example.co.za')
    expect(byId('q-id').value).toBe('')
    expect(byId('q-id').hasAttribute(SENSITIVE_ATTR)).toBe(true)
  })
})

describe('workdayAdapter', () => {
  it('leaves the sign-in page entirely to the candidate', async () => {
    load(workdaySignInHtml)

    expect(workdayAdapter.isSignIn?.()).toBe(true)
    expect(workdayAdapter.isReady()).toBe(true)
    expect(workdayAdapter.fields()).toEqual({})
    expect(workdayAdapter.questions()).toEqual([])
    expect(workdayAdapter.resumeInput()).toBeNull()

    const report = await fillForm(workdayAdapter, pkg, { settleMs: 0 })
    expect(report.filled).toEqual([])
    expect(byId('wd-email').value).toBe('')
    expect(byId('wd-password').value).toBe('')
    expect(nextClicks).toEqual([])
  })

  it('reads the current step from the progress bar', () => {
    load(workdayInfoHtml)
    expect(workdayAdapter.isSignIn?.()).toBe(false)
    expect(workdayAdapter.currentStep?.()).toEqual({ index: 1, total: 6, name: 'My Information' })

    load(workdayQuestionsHtml)
    expect(workdayAdapter.currentStep?.()).toEqual({
      index: 3,
      total: 6,
      name: 'Application Questions',
    })
  })

  it('is not ready before the apply flow renders', () => {
    document.body.innerHTML = '<div data-automation-id="jobPostingPage"><h2>Analyst</h2></div>'
    expect(workdayAdapter.isReady()).toBe(false)
  })

  it('fills My Information without touching country or phone dropdowns or Next', async () => {
    load(workdayInfoHtml)

    const fields = workdayAdapter.fields()
    expect(fields.firstName?.id).toBe('input-4')
    expect(fields.lastName?.id).toBe('input-5')
    expect(fields.email?.id).toBe('input-10')
    expect(fields.phone?.id).toBe('input-13')
    expect(fields.location?.id).toBe('input-8')

    const questions = workdayAdapter.questions()
    expect(questions.map((question) => question.label)).toEqual([
      'Have you previously worked for Absa?',
    ])

    const report = await fillForm(workdayAdapter, pkg, { settleMs: 0 })
    expect(report.fileProblem).toBeNull()
    expect(byId('input-4').value).toBe('Thandi')
    expect(byId('input-13').value).toBe('+27 82 123 4567')
    expect(byId('input-1').textContent?.trim()).toBe('South Africa')
    expect(nextClicks).toEqual([])
  })

  it('attaches the resume on My Experience', async () => {
    load(workdayExperienceHtml)

    expect(workdayAdapter.resumeInput()?.getAttribute('data-automation-id')).toBe(
      'file-upload-input-ref',
    )
    const report = await fillForm(workdayAdapter, pkg, { settleMs: 0 })
    expect(report.fileName).toBe('Thandi-CV.docx')
    expect(byId('input-20').value).toBe('https://www.linkedin.com/in/thandi')
    expect(nextClicks).toEqual([])
  })

  it('collects listbox questions and flags employment equity', () => {
    load(workdayQuestionsHtml)
    const questions = workdayAdapter.questions()

    const work = questions.find((question) => /legally allowed/.test(question.label))
    expect(work).toMatchObject({ kind: 'text', listbox: true, required: true, sensitive: false })
    expect(work?.category).toBe('work_authorization')
    const race = questions.find((question) => /race/i.test(question.label))
    expect(race?.sensitive).toBe(true)
    const why = questions.find((question) => /join Absa/.test(question.label))
    expect(why?.kind).toBe('textarea')
  })

  it('picks listbox options and never answers the sensitive one', async () => {
    load(workdayQuestionsHtml)
    const questions = workdayAdapter.questions()
    const answers = new Map(
      questions.map((question) => [
        question.key,
        /licence/.test(question.label) ? 'Yes - Code B' : /race/i.test(question.label) ? 'African' : 'Yes',
      ]),
    )

    const result = await fillAnswers(questions, answers)

    expect(listboxValue(byId('q-work'))).toBe('Yes')
    expect(listboxValue(byId('q-licence'))).toBe('Yes - Code B')
    expect(listboxValue(byId('q-race'))).toBe('')
    expect(byId<HTMLTextAreaElement>('q-why').value).toBe('Yes')
    expect(result.answered).toHaveLength(3)
    expect(byId('popup-work').hidden).toBe(true)
    expect(nextClicks).toEqual([])
  })

  it('closes the listbox when no option matches', async () => {
    load(workdayQuestionsHtml)
    const chosen = await chooseFromListbox(byId('q-work'), 'Maybe later')

    expect(chosen).toBe(false)
    expect(listboxValue(byId('q-work'))).toBe('')
    expect(byId('popup-work').hidden).toBe(true)
  })

  it('treats every question on Voluntary Disclosures as sensitive', async () => {
    load(workdayVoluntaryHtml)

    expect(workdayAdapter.fields()).toEqual({})
    expect(workdayAdapter.resumeInput()).toBeNull()
    const questions = workdayAdapter.questions()
    expect(questions.length).toBeGreaterThanOrEqual(4)
    expect(questions.every((question) => question.sensitive)).toBe(true)

    const report = await fillForm(workdayAdapter, pkg, { settleMs: 0 })
    expect(report.filled).toEqual([])
    expect(report.sensitive).toBe(questions.length)
    expect(byId('vd-email').value).toBe('')
    expect(byId('vd-nationality').hasAttribute(SENSITIVE_ATTR)).toBe(true)
    expect(byId('vd-consent').checked).toBe(false)
  })

  it('detects the self-identification step by name too', () => {
    load(workdayVoluntaryHtml.replace('Voluntary Disclosures</label>', 'Self Identify</label>')
      .replace('voluntaryDisclosuresPage', 'somePage'))
    expect(workdayAdapter.questions().every((question) => question.sensitive)).toBe(true)
  })
})

describe('successFactorsAdapter', () => {
  it('matches UI5 fields by label', () => {
    load(successFactorsHtml)

    expect(successFactorsAdapter.isReady()).toBe(true)
    const fields = successFactorsAdapter.fields()
    expect(fields.firstName?.id).toBe('__input0-inner')
    expect(fields.lastName?.id).toBe('__input1-inner')
    expect(fields.email?.id).toBe('__input2-inner')
    expect(fields.phone?.id).toBe('__input4-inner')
    expect(fields.location?.id).toBe('__input5-inner')
    expect(successFactorsAdapter.resumeInput()?.id).toBe('resumeUpload')
  })

  it('fills contact details, confirm email and the cover letter, not the ID or race', async () => {
    load(successFactorsHtml)
    const report = await fillForm(successFactorsAdapter, pkg, {
      settleMs: 0,
      coverLetter: {
        text: 'Dear Hiring Team,\n\nI would like to join Nedbank.',
        fetchFile: async () => file,
      },
    })

    expect(byId('__input2-inner').value).toBe('thandi@example.co.za')
    expect(byId('__input3-inner').value).toBe('thandi@example.co.za')
    expect(report.coverLetterPasted).toBe(true)
    expect(byId<HTMLTextAreaElement>('__area0-inner').value).toContain('join Nedbank')
    expect(byId('__input6-inner').value).toBe('')
    expect(byId('__input6-inner').hasAttribute(SENSITIVE_ATTR)).toBe(true)
    expect(byId('__select1').hasAttribute(SENSITIVE_ATTR)).toBe(true)
    expect(nextClicks).toEqual([])
  })

  it('leaves the sign-in page alone', () => {
    document.body.innerHTML = `<form><label for="u">Email</label><input id="u" type="email" />
      <label for="p">Password</label><input id="p" type="password" /></form>`
    expect(successFactorsAdapter.isSignIn?.()).toBe(true)
    expect(successFactorsAdapter.fields()).toEqual({})
    expect(successFactorsAdapter.questions()).toEqual([])
  })
})

describe('workableAdapter', () => {
  it('maps Workable fields by name', () => {
    load(workableHtml)

    expect(workableAdapter.isReady()).toBe(true)
    const fields = workableAdapter.fields()
    expect(fields.firstName?.id).toBe('firstname')
    expect(fields.lastName?.id).toBe('lastname')
    expect(fields.email?.id).toBe('email')
    expect(fields.phone?.id).toBe('phone')
    expect(fields.location?.id).toBe('address')
    expect(workableAdapter.resumeInput()?.getAttribute('name')).toBe('resume')
    expect(workableAdapter.coverLetterTextarea()?.id).toBe('cover_letter')
  })

  it('collects QA questions but not the cover letter', () => {
    load(workableHtml)
    const questions = workableAdapter.questions()
    const notice = questions.find((question) => /notice period/.test(question.label))
    expect(notice?.category).toBe('notice_period')
    expect(notice?.required).toBe(true)
    const sponsorship = questions.find((question) => /sponsorship/.test(question.label))
    expect(sponsorship?.kind).toBe('radio')
    expect(questions.some((question) => /cover letter/i.test(question.label))).toBe(false)
  })

  it('detects the submitted view', () => {
    load(workableHtml)
    expect(workableAdapter.isConfirmation()).toBe(false)
    document.body.insertAdjacentHTML('beforeend', '<div data-ui="application-submitted"></div>')
    expect(workableAdapter.isConfirmation()).toBe(true)
  })
})
