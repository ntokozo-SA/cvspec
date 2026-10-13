import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ApplicantProfile, CoverLetterFormat, TailoredFile } from '../../shared/types'
import { genericFormAdapter } from './adapters/generic'
import { greenhouseAdapter } from './adapters/greenhouse'
import { leverAdapter } from './adapters/lever'
import greenhouseHtml from './__fixtures__/greenhouse.html?raw'
import leverHtml from './__fixtures__/lever.html?raw'
import leverCoverHtml from './__fixtures__/lever-cover.html?raw'
import plainHtml from './__fixtures__/plain.html?raw'
import greenhouseQuestionsHtml from './__fixtures__/greenhouse-questions.html?raw'
import plainSaHtml from './__fixtures__/plain-sa.html?raw'
import {
  acceptsDocx,
  acceptsPdf,
  DOCX_TYPE,
  fillAnswers,
  fillForm,
  findRequiredUnfilled,
  SENSITIVE_ATTR,
  setFieldValue,
} from './fill'

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

describe('fillForm with sensitive questions', () => {
  beforeEach(() => {
    document.body.innerHTML = greenhouseQuestionsHtml
  })

  it('outlines sensitive questions in purple, separately from required fields', async () => {
    const report = await fillForm(
      greenhouseAdapter,
      { profile, file, fileError: null },
      { settleMs: 0 },
    )

    expect(report.sensitive).toBe(5)
    const idField = input('#question_15')
    expect(idField.value).toBe('')
    expect(idField.getAttribute(SENSITIVE_ATTR)).toBe('true')
    expect(idField.hasAttribute('data-cvspec-needs-input')).toBe(false)
    expect(idField.title).toMatch(/answer this yourself/i)
    expect(document.querySelector('#job_application_race')?.getAttribute(SENSITIVE_ATTR)).toBe(
      'true',
    )
    expect(document.querySelector('#question_10')?.hasAttribute('data-cvspec-needs-input')).toBe(
      true,
    )
  })
})

describe('fillAnswers', () => {
  it('fills text, select, radio and checkbox questions and never sensitive ones', async () => {
    document.body.innerHTML = plainSaHtml
    const questions = genericFormAdapter.questions()
    const keyOf = (label: string) => {
      const found = questions.find((question) => question.label === label)
      if (!found) throw new Error(`No question ${label}`)
      return found.key
    }
    const answers = new Map<string, string>([
      [keyOf('Motivation: why should we hire you?'), 'I have audited three listed companies.'],
      [keyOf('Expected salary'), 'R30 000 per month'],
      [keyOf('Notice period'), '1 month'],
      [keyOf('Willing to relocate'), 'Yes'],
      [keyOf('Languages spoken'), 'English; isiZulu'],
      [keyOf('SA ID number'), '8001015009087'],
      [keyOf('Gender'), 'Female'],
      [keyOf('Group'), 'African'],
    ])

    const result = await fillAnswers(questions, answers)

    expect(result.answered).toHaveLength(5)
    expect(document.querySelector<HTMLTextAreaElement>('#why')?.value).toMatch(/audited/)
    expect(input('#sal').value).toBe('R30 000 per month')
    expect(document.querySelector<HTMLSelectElement>('#notice')?.value).toBe('1 month')
    expect(input('input[name="relocate"]').checked).toBe(true)
    const languages = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="lang"]'),
    ).map((box) => box.checked)
    expect(languages).toEqual([true, false, true])

    expect(input('#idno').value).toBe('')
    expect(
      Array.from(document.querySelectorAll<HTMLInputElement>('input[name="gender"]')).some(
        (radio) => radio.checked,
      ),
    ).toBe(false)
    expect(document.querySelector<HTMLSelectElement>('#group')?.value).toBe('')
  })

  it('keeps answers the page already has and reports options that do not exist', async () => {
    document.body.innerHTML = greenhouseQuestionsHtml
    const questions = greenhouseAdapter.questions()
    const [why, , notice, relocate] = questions.filter((question) => !question.sensitive)
    document.querySelector<HTMLTextAreaElement>('#question_10')!.value = 'My own words'

    const result = await fillAnswers(
      questions,
      new Map([
        [why.key, 'Drafted'],
        [notice.key, '6 weeks'],
        [relocate.key, 'No'],
      ]),
    )

    expect(document.querySelector<HTMLTextAreaElement>('#question_10')?.value).toBe('My own words')
    expect(result.kept).toEqual([why.key])
    expect(result.unmatched).toEqual([notice.key])
    expect(
      document.querySelector<HTMLInputElement>('input[name="question_13"][value="0"]')?.checked,
    ).toBe(true)
  })
})

describe('cover letters', () => {
  const letterText = 'Dear Hiring Team,\n\nI would like to apply for this role.'
  const letter = (fetched: CoverLetterFormat[] = []) => ({
    text: letterText,
    fetchFile: async (format: CoverLetterFormat): Promise<TailoredFile> => {
      fetched.push(format)
      return {
        base64: btoa(format === 'pdf' ? '%PDF-1.7' : 'PK docx'),
        fileName: `Jane-Doe-cover-letter.${format}`,
        unapplied: [],
        mimeType: format === 'pdf' ? 'application/pdf' : DOCX_TYPE,
      }
    },
  })

  it('attaches a DOCX letter to the Greenhouse cover letter upload', async () => {
    document.body.innerHTML = greenhouseHtml
    const fetched: CoverLetterFormat[] = []
    const report = await fillForm(
      greenhouseAdapter,
      { profile, file, fileError: null },
      { settleMs: 0, coverLetter: letter(fetched) },
    )

    expect(fetched).toEqual(['docx'])
    expect(report.coverLetterFileName).toBe('Jane-Doe-cover-letter.docx')
    expect(input('#cover_letter').files?.[0]?.name).toBe('Jane-Doe-cover-letter.docx')
    expect(input('#cover_letter').files?.[0]?.type).toBe(DOCX_TYPE)
    expect(input('#resume').files?.[0]?.name).toBe('Jane-Doe-tailored.docx')
  })

  it('sends a PDF when the upload only takes PDFs', async () => {
    document.body.innerHTML = plainHtml
    const fetched: CoverLetterFormat[] = []
    const report = await fillForm(
      genericFormAdapter,
      { profile, file, fileError: null },
      { settleMs: 0, coverLetter: letter(fetched) },
    )

    expect(fetched).toEqual(['pdf'])
    expect(input('#cl').files?.[0]?.type).toBe('application/pdf')
    expect(report.coverLetterFileName).toBe('Jane-Doe-cover-letter.pdf')
    expect(input('#cv').files?.length).toBe(0)
  })

  it('pastes into the Lever additional information box and keeps it out of the questions', async () => {
    document.body.innerHTML = leverCoverHtml
    const fetched: CoverLetterFormat[] = []
    const report = await fillForm(
      leverAdapter,
      { profile, file, fileError: null },
      { settleMs: 0, coverLetter: letter(fetched) },
    )

    expect(fetched).toEqual([])
    expect(report.coverLetterPasted).toBe(true)
    expect(document.querySelector<HTMLTextAreaElement>('textarea[name="comments"]')?.value).toBe(
      letterText,
    )
    expect(input('#resume-upload-input').files?.[0]?.name).toBe('Jane-Doe-tailored.docx')
    const labels = leverAdapter.questions().map((question) => question.label)
    expect(labels).toEqual(['Why do you want to join Acme?'])
  })

  it('leaves a cover letter box that already has text', async () => {
    document.body.innerHTML = leverCoverHtml
    const box = document.querySelector<HTMLTextAreaElement>('textarea[name="comments"]')!
    box.value = 'My own note'
    const report = await fillForm(
      leverAdapter,
      { profile, file: null, fileError: null },
      { settleMs: 0, coverLetter: letter() },
    )
    expect(box.value).toBe('My own note')
    expect(report.coverLetterPasted).toBe(false)
  })

  it('never attaches the letter to the resume input', async () => {
    document.body.innerHTML = `
      <form>
        <label for="docs">Resume and cover letter</label>
        <input id="docs" type="file" />
        <label for="em">Email</label>
        <input id="em" type="email" />
      </form>`
    const fetched: CoverLetterFormat[] = []
    const report = await fillForm(
      genericFormAdapter,
      { profile, file: null, fileError: null },
      { settleMs: 0, coverLetter: letter(fetched) },
    )
    expect(genericFormAdapter.resumeInput()?.id).toBe('docs')
    expect(genericFormAdapter.coverLetterInput()).toBeNull()
    expect(fetched).toEqual([])
    expect(input('#docs').files?.length).toBe(0)
    expect(report.coverLetterFileName).toBeNull()
  })

  it('reports a failed build and attaches nothing', async () => {
    document.body.innerHTML = greenhouseHtml
    const report = await fillForm(
      greenhouseAdapter,
      { profile, file: null, fileError: null },
      {
        settleMs: 0,
        coverLetter: {
          text: letterText,
          fetchFile: async () => {
            throw new Error('Write or generate a cover letter for this job first')
          },
        },
      },
    )
    expect(report.coverLetterProblem).toMatch(/cover letter/)
    expect(input('#cover_letter').files?.length).toBe(0)
  })

  it('skips letters that are only whitespace', async () => {
    document.body.innerHTML = greenhouseHtml
    const fetched: CoverLetterFormat[] = []
    await fillForm(
      greenhouseAdapter,
      { profile, file: null, fileError: null },
      { settleMs: 0, coverLetter: { ...letter(fetched), text: '   ' } },
    )
    expect(fetched).toEqual([])
  })
})

describe('acceptsPdf', () => {
  it('allows PDFs, wildcards and empty accept lists only', () => {
    const withAccept = (accept: string) => {
      const element = document.createElement('input')
      element.type = 'file'
      element.accept = accept
      return element
    }
    expect(acceptsPdf(withAccept(''))).toBe(true)
    expect(acceptsPdf(withAccept('.pdf'))).toBe(true)
    expect(acceptsPdf(withAccept('application/pdf'))).toBe(true)
    expect(acceptsPdf(withAccept('.doc,.docx'))).toBe(false)
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
