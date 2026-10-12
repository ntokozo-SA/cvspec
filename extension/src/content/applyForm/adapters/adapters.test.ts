import { afterEach, describe, expect, it } from 'vitest'
import greenhouseHtml from '../__fixtures__/greenhouse.html?raw'
import leverHtml from '../__fixtures__/lever.html?raw'
import plainHtml from '../__fixtures__/plain.html?raw'
import { findApplicationForm, findResumeInput, genericFormAdapter, matchFields } from './generic'
import { greenhouseAdapter } from './greenhouse'
import { findApplyFormAdapter } from './index'
import { leverAdapter } from './lever'

const START_PATH = window.location.pathname

afterEach(() => {
  document.body.innerHTML = ''
  window.history.replaceState({}, '', START_PATH)
})

describe('findApplyFormAdapter', () => {
  it('picks the adapter by hiring-system host', () => {
    expect(findApplyFormAdapter(new URL('https://boards.greenhouse.io/acme/jobs/1')).system).toBe(
      'greenhouse',
    )
    expect(
      findApplyFormAdapter(new URL('https://job-boards.eu.greenhouse.io/acme/jobs/1')).system,
    ).toBe('greenhouse')
    expect(findApplyFormAdapter(new URL('https://jobs.lever.co/acme/abc/apply')).system).toBe(
      'lever',
    )
    expect(findApplyFormAdapter(new URL('https://careers.acme.com/apply')).system).toBe('generic')
  })
})

describe('greenhouseAdapter', () => {
  it('finds the form, resume input and contact fields', () => {
    document.body.innerHTML = greenhouseHtml

    expect(greenhouseAdapter.isReady()).toBe(true)
    expect(greenhouseAdapter.resumeInput()?.id).toBe('resume')
    const fields = greenhouseAdapter.fields()
    expect(fields.firstName?.id).toBe('first_name')
    expect(fields.lastName?.id).toBe('last_name')
    expect(fields.email?.id).toBe('email')
    expect(fields.linkedinUrl?.id).toBe('question_1')
    expect(fields.websiteUrl?.id).toBe('question_2')
    expect(fields.fullName).toBeUndefined()
    expect(fields.location).toBeUndefined()
  })

  it('is not ready before the form renders', () => {
    document.body.innerHTML = '<div id="app"><p>Loading...</p></div>'
    expect(greenhouseAdapter.isReady()).toBe(false)
  })

  it('detects the confirmation page', () => {
    document.body.innerHTML = greenhouseHtml
    expect(greenhouseAdapter.isConfirmation()).toBe(false)

    window.history.pushState({}, '', '/acme/jobs/123/confirmation')
    expect(greenhouseAdapter.isConfirmation()).toBe(true)
  })

  it('detects a thank-you heading', () => {
    document.body.innerHTML = '<h1>Thank you for applying.</h1>'
    expect(greenhouseAdapter.isConfirmation()).toBe(true)
  })
})

describe('leverAdapter', () => {
  it('maps the full-name field and resume upload', () => {
    document.body.innerHTML = leverHtml

    expect(leverAdapter.isReady()).toBe(true)
    expect(leverAdapter.resumeInput()?.id).toBe('resume-upload-input')
    const fields = leverAdapter.fields()
    expect(fields.fullName?.getAttribute('name')).toBe('name')
    expect(fields.firstName).toBeUndefined()
    expect(fields.lastName).toBeUndefined()
    expect(fields.linkedinUrl?.getAttribute('name')).toBe('urls[LinkedIn]')
    expect(fields.websiteUrl?.getAttribute('name')).toBe('urls[Portfolio]')
  })

  it('detects the thanks page', () => {
    window.history.pushState({}, '', '/acme/abc-123/thanks')
    expect(leverAdapter.isConfirmation()).toBe(true)
  })
})

describe('generic matching', () => {
  it('picks the application form over the search form', () => {
    document.body.innerHTML = plainHtml
    expect(findApplicationForm()?.id).toBe('apply')
    expect(genericFormAdapter.isReady()).toBe(true)
  })

  it('matches fields by label and skips hidden, search and other-person fields', () => {
    document.body.innerHTML = plainHtml
    const fields = matchFields(findApplicationForm()!)

    expect(fields.firstName?.id).toBe('fn')
    expect(fields.lastName?.id).toBe('ln')
    expect(fields.email?.id).toBe('em')
    expect(fields.phone?.id).toBe('tel')
    expect(fields.linkedinUrl?.id).toBe('li')
    expect(fields.websiteUrl?.id).toBe('pf')
    expect(Object.values(fields).map((field) => field?.id)).not.toContain('ref')
  })

  it('prefers the file input labelled resume or CV over a cover letter', () => {
    document.body.innerHTML = plainHtml
    expect(findResumeInput(findApplicationForm()!)?.id).toBe('cv')
  })

  it('uses the only file input when it is not a cover letter', () => {
    document.body.innerHTML =
      '<form><label>Attachment <input type="file" id="only" /></label></form>'
    expect(findResumeInput(document)?.id).toBe('only')

    document.body.innerHTML =
      '<form><label>Cover letter <input type="file" id="cover" /></label></form>'
    expect(findResumeInput(document)).toBeNull()
  })

  it('matches a single name field as the full name', () => {
    document.body.innerHTML =
      '<form><label for="n">Name</label><input id="n" /><label for="c">Company name</label><input id="c" /></form>'
    const fields = matchFields(document)
    expect(fields.fullName?.id).toBe('n')
  })
})
