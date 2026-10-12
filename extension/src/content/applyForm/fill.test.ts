import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ApplicantProfile, TailoredFile } from '../../shared/types'
import { genericFormAdapter } from './adapters/generic'
import { greenhouseAdapter } from './adapters/greenhouse'
import { leverAdapter } from './adapters/lever'
import greenhouseHtml from './__fixtures__/greenhouse.html?raw'
import leverHtml from './__fixtures__/lever.html?raw'
import plainHtml from './__fixtures__/plain.html?raw'
import { acceptsDocx, DOCX_TYPE, fillForm, findRequiredUnfilled, setFieldValue } from './fill'

const profile: ApplicantProfile = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '+27 82 123 4567',
  location: 'Cape Town',
  linkedinUrl: 'https://www.linkedin.com/in/janedoe',
  websiteUrl: 'https://janedoe.dev',
  updatedAt: null,
  saved: true,
}

const file: TailoredFile = {
  base64: btoa('PK fake docx bytes'),
  fileName: 'Jane-Doe-tailored.docx',
  unapplied: [2],
}

function input(selector: string): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(selector)
  if (!element) throw new Error(`Missing ${selector}`)
  return element
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('acceptsDocx', () => {
  const withAccept = (accept: string) => {
    const element = document.createElement('input')
    element.type = 'file'
    element.accept = accept
    return element
  }

  it('allows inputs without an accept list', () => {
    expect(acceptsDocx(withAccept(''))).toBe(true)
  })

  it('allows .docx, the DOCX MIME type and wildcards', () => {
    expect(acceptsDocx(withAccept('.pdf,.doc,.docx'))).toBe(true)
    expect(acceptsDocx(withAccept(`application/pdf, ${DOCX_TYPE}`))).toBe(true)
    expect(acceptsDocx(withAccept('application/*'))).toBe(true)
  })

  it('rejects PDF-only and .doc-only inputs', () => {
    expect(acceptsDocx(withAccept('.pdf'))).toBe(false)
    expect(acceptsDocx(withAccept('.pdf,.doc'))).toBe(false)
  })
})

describe('setFieldValue', () => {
  it('sets the value and fires input and change events', () => {
    document.body.innerHTML = '<input id="x" />'
    const field = input('#x')
    const events: string[] = []
    field.addEventListener('input', () => events.push('input'))
    field.addEventListener('change', () => events.push('change'))

    setFieldValue(field, 'hello')

    expect(field.value).toBe('hello')
    expect(events).toEqual(['input', 'change'])
  })
})

describe('fillForm on Greenhouse', () => {
  beforeEach(() => {
    document.body.innerHTML = greenhouseHtml
  })

  it('attaches the resume, fills contact fields and flags required questions', async () => {
    const report = await fillForm(
      greenhouseAdapter,
      { profile, file, fileError: null },
      { settleMs: 0 },
    )

    expect(report.fileName).toBe('Jane-Doe-tailored.docx')
    expect(report.fileProblem).toBeNull()
    expect(report.unappliedEdits).toBe(1)
    expect(input('#resume').files?.[0]?.name).toBe('Jane-Doe-tailored.docx')
    expect(input('#resume').files?.[0]?.type).toBe(DOCX_TYPE)
    expect(input('#cover_letter').files?.length).toBe(0)

    expect(input('#first_name').value).toBe('Jane')
    expect(input('#last_name').value).toBe('Doe')
    expect(input('#email').value).toBe('jane@example.com')
    expect(input('#phone').value).toBe('+27 82 123 4567')
    expect(input('#question_1').value).toBe('https://www.linkedin.com/in/janedoe')
    expect(input('#question_2').value).toBe('https://janedoe.dev')
    expect(input('#candidate-location').value).toBe('')

    expect(report.needsInput).toBe(1)
    expect(document.querySelector('#question_3')?.hasAttribute('data-cvspec-needs-input')).toBe(
      true,
    )
  })

  it('keeps values the candidate already typed', async () => {
    input('#email').value = 'other@example.com'

    const report = await fillForm(
      greenhouseAdapter,
      { profile, file: null, fileError: 'No tailored resume chosen' },
      { settleMs: 0 },
    )

    expect(input('#email').value).toBe('other@example.com')
    expect(report.kept).toContain('email')
    expect(report.fileName).toBeNull()
    expect(report.fileProblem).toBe('No tailored resume chosen')
  })
})

describe('fillForm on Lever', () => {
  beforeEach(() => {
    document.body.innerHTML = leverHtml
  })

  it('uses the single full-name field and named URL fields', async () => {
    const report = await fillForm(leverAdapter, { profile, file, fileError: null }, { settleMs: 0 })

    expect(input('#resume-upload-input').files?.[0]?.name).toBe('Jane-Doe-tailored.docx')
    expect(input('input[name="name"]').value).toBe('Jane Doe')
    expect(input('input[name="email"]').value).toBe('jane@example.com')
    expect(input('input[name="location"]').value).toBe('Cape Town')
    expect(input('input[name="urls[LinkedIn]"]').value).toBe('https://www.linkedin.com/in/janedoe')
    expect(input('input[name="urls[Portfolio]"]').value).toBe('https://janedoe.dev')
    expect(input('input[name="urls[GitHub]"]').value).toBe('')
    expect(input('input[name="org"]').value).toBe('')
    expect(report.filled).not.toContain('firstName')
    expect(report.needsInput).toBe(0)
  })
})

describe('fillForm on a plain form', () => {
  beforeEach(() => {
    document.body.innerHTML = plainHtml
  })

  it('skips the resume when the form only takes PDFs and leaves other people fields alone', async () => {
    const report = await fillForm(
      genericFormAdapter,
      { profile, file, fileError: null },
      { settleMs: 0 },
    )

    expect(report.fileName).toBeNull()
    expect(report.fileProblem).toMatch(/needs a PDF/)
    expect(input('#cv').files?.length).toBe(0)

    expect(input('#fn').value).toBe('Jane')
    expect(input('#ln').value).toBe('Doe')
    expect(input('#em').value).toBe('jane@example.com')
    expect(input('#tel').value).toBe('+27 82 123 4567')
    expect(input('#li').value).toBe('https://www.linkedin.com/in/janedoe')
    expect(input('#pf').value).toBe('https://janedoe.dev')
    expect(input('#ref').value).toBe('')
    expect(input('input[name="website_hp"]').value).toBe('')
    expect(input('input[name="q"]').value).toBe('')

    expect(report.needsInput).toBe(1)
  })
})

describe('findRequiredUnfilled', () => {
  it('counts a radio group once and ignores answered groups', () => {
    document.body.innerHTML = `
      <form>
        <input type="radio" name="a" value="1" required />
        <input type="radio" name="a" value="2" required />
        <input type="radio" name="b" value="1" required checked />
        <input type="radio" name="b" value="2" required />
        <input type="text" name="hidden-one" required style="display: none" />
      </form>`
    expect(findRequiredUnfilled(document)).toHaveLength(1)
  })
})
