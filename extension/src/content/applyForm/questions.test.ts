import { afterEach, describe, expect, it } from 'vitest'
import type { SavedAnswer } from '../../shared/types'
import { genericFormAdapter } from './adapters/generic'
import { greenhouseAdapter } from './adapters/greenhouse'
import greenhouseQuestionsHtml from './__fixtures__/greenhouse-questions.html?raw'
import plainSaHtml from './__fixtures__/plain-sa.html?raw'
import { categorize, chooseOption, matchBank, questionKey, toPayload } from './questions'

afterEach(() => {
  document.body.innerHTML = ''
})

function saved(overrides: Partial<SavedAnswer>): SavedAnswer {
  return {
    id: 'a',
    category: 'other',
    question: 'Question',
    answer: 'Answer',
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

describe('collectQuestions on Greenhouse', () => {
  it('lists custom questions with kinds, options and categories, and skips contact fields', () => {
    document.body.innerHTML = greenhouseQuestionsHtml
    const questions = greenhouseAdapter.questions()
    const open = questions.filter((question) => !question.sensitive)

    expect(open.map((question) => [question.label, question.kind, question.category])).toEqual([
      ['Why do you want to work at Acme?', 'textarea', 'motivation'],
      ['What are your salary expectations (CTC per month)?', 'text', 'salary'],
      ['What is your notice period?', 'select', 'notice_period'],
      ['Are you willing to relocate to Johannesburg?', 'radio', 'relocation'],
      ['How did you hear about this job?', 'text', 'referral_source'],
    ])
    expect(open[0]).toMatchObject({ required: true, maxLength: 1000 })
    expect(open[2].options).toEqual(['Immediately', '1 month', '2 months', '3 months'])
    expect(open[3].options).toEqual(['Yes', 'No'])
    expect(open[3].required).toBe(true)
    expect(open.every((question) => question.key.startsWith('greenhouse:'))).toBe(true)
  })

  it('flags ID, criminal-record and voluntary self-identification questions as sensitive', () => {
    document.body.innerHTML = greenhouseQuestionsHtml
    const sensitive = greenhouseAdapter
      .questions()
      .filter((question) => question.sensitive)
      .map((question) => question.label)
    expect(sensitive).toEqual([
      'ID Number',
      'Do you have a criminal record?',
      'Gender',
      'Race',
      'Disability Status',
    ])
  })

  it('never puts sensitive questions in the payload sent to the server', () => {
    document.body.innerHTML = greenhouseQuestionsHtml
    const payload = greenhouseAdapter
      .questions()
      .filter((question) => !question.sensitive)
      .map(toPayload)
    const text = JSON.stringify(payload)
    expect(text).not.toMatch(/ID Number|criminal|Gender|Race|Disability/i)
    expect(Object.keys(payload[0]).sort()).toEqual(
      ['category', 'key', 'kind', 'label', 'maxLength', 'options', 'required'].sort(),
    )
  })
})

describe('collectQuestions on a plain South African form', () => {
  it('detects equity questions by label or by their options, and skips consent and referees', () => {
    document.body.innerHTML = plainSaHtml
    const questions = genericFormAdapter.questions()
    const byLabel = new Map(questions.map((question) => [question.label, question]))

    for (const label of ['SA ID number', 'Group', 'Gender', 'Do you have a disability?']) {
      expect(byLabel.get(label)?.sensitive, label).toBe(true)
    }
    expect(byLabel.get('Criminal record')?.sensitive).toBe(true)

    expect(byLabel.get('Motivation: why should we hire you?')).toMatchObject({
      kind: 'textarea',
      category: 'motivation',
      sensitive: false,
    })
    expect(byLabel.get('Willing to relocate')).toMatchObject({
      kind: 'checkbox',
      options: [],
      category: 'relocation',
      sensitive: false,
    })
    expect(byLabel.get('Languages spoken')).toMatchObject({
      kind: 'checkbox',
      options: ['English', 'Afrikaans', 'isiZulu'],
    })
    expect([...byLabel.keys()].some((label) => /consent|referee|search/i.test(label))).toBe(false)
    expect([...byLabel.keys()]).not.toContain('First name')
    expect([...byLabel.keys()]).not.toContain('Email')
  })
})

describe('categorize', () => {
  it.each([
    ['Expected remuneration', 'salary'],
    ['When can you start?', 'start_date'],
    ['Do you require visa sponsorship?', 'work_authorization'],
    ['Are you a South African citizen?', 'work_authorization'],
    ['What excites you about this role?', 'motivation'],
    ['Years of SQL experience', 'other'],
  ])('%s is %s', (label, category) => {
    expect(categorize(label)).toBe(category)
  })
})

describe('questionKey', () => {
  it('is stable for the same label and differs by system', () => {
    expect(questionKey('greenhouse', 'Notice period?')).toBe(
      questionKey('greenhouse', 'notice  period'),
    )
    expect(questionKey('greenhouse', 'Notice period')).not.toBe(
      questionKey('lever', 'Notice period'),
    )
  })
})

describe('chooseOption', () => {
  it('maps answers onto options', () => {
    expect(chooseOption('1 month', ['Immediately', '1 month'])).toBe('1 month')
    expect(chooseOption('Yes, happy to', ['Yes', 'No'])).toBe('Yes')
    expect(chooseOption('Not sure', ['Yes', 'No'])).toBeNull()
  })
})

describe('matchBank', () => {
  const notice = {
    label: 'What is your notice period?',
    kind: 'select' as const,
    options: ['Immediately', '1 month', '2 months'],
    category: 'notice_period' as const,
  }

  it('reuses saved answers by category and maps them to options', () => {
    const bank = [saved({ category: 'notice_period', question: 'Notice', answer: '1 month' })]
    expect(matchBank(notice, bank)).toBe('1 month')
  })

  it('reuses by similar label for other questions', () => {
    const bank = [
      saved({ question: 'Years of experience with SQL', answer: '4 years', category: 'other' }),
    ]
    expect(
      matchBank(
        { label: 'Years of SQL experience', kind: 'text', options: [], category: 'other' },
        bank,
      ),
    ).toBe('4 years')
  })

  it('never reuses motivation answers', () => {
    const bank = [saved({ question: 'Why do you want to work at Acme?', category: 'motivation' })]
    expect(
      matchBank(
        { label: 'Why do you want to work at Acme?', kind: 'textarea', options: [], category: 'motivation' },
        bank,
      ),
    ).toBeNull()
  })

  it('returns null when a saved choice fits none of the options', () => {
    const bank = [saved({ category: 'notice_period', answer: '6 weeks' })]
    expect(matchBank(notice, bank)).toBeNull()
  })
})
