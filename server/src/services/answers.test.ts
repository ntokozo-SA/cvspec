import { afterEach, describe, expect, it, vi } from 'vitest'
import { draftSchema, saveSchema } from '../routes/answers.js'
import type { QuestionInput, SavedAnswer } from '../types/index.js'
import { setAiClientForTests, type AiClient } from './aiClient.js'
import {
  bankAnswerFor,
  chooseOption,
  draftAnswers,
  finalizeAiDrafts,
  fitLength,
  planDrafts,
} from './answers.js'
import { draftAnswerTexts, type CandidateContext } from './openai.js'

function question(overrides: Partial<QuestionInput>): QuestionInput {
  return {
    key: 'k',
    label: 'Question',
    kind: 'text',
    options: [],
    maxLength: null,
    category: 'other',
    required: false,
    ...overrides,
  }
}

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

const why = question({
  key: 'why',
  label: 'Why do you want to work at Acme?',
  kind: 'textarea',
  category: 'motivation',
})
const salary = question({
  key: 'salary',
  label: 'Salary expectation (CTC)',
  category: 'salary',
})
const notice = question({
  key: 'notice',
  label: 'Notice period',
  kind: 'select',
  options: ['Immediately', '1 month', '2 months', '3 months'],
  category: 'notice_period',
})
const race = question({ key: 'race', label: 'Population group', kind: 'select', options: ['A'] })
const idNumber = question({ key: 'id', label: 'ID Number' })

describe('chooseOption', () => {
  it('matches exactly, by whole phrase, and by yes or no', () => {
    expect(chooseOption('1 month', notice.options)).toBe('1 month')
    expect(chooseOption('My notice is 1 month', notice.options)).toBe('1 month')
    expect(chooseOption('Yes, happy to relocate', ['Yes', 'No'])).toBe('Yes')
    expect(chooseOption('no', ['Yes', 'No'])).toBe('No')
  })

  it('does not match parts of words', () => {
    expect(chooseOption('Not sure', ['No', 'Yes'])).toBeNull()
    expect(chooseOption('Unknown', ['No', 'Yes'])).toBeNull()
  })
})

describe('fitLength', () => {
  it('cuts on a word boundary', () => {
    expect(fitLength('one two three four', 12)).toBe('one two')
    expect(fitLength('short', 100)).toBe('short')
  })
})

describe('planDrafts', () => {
  it('drops sensitive questions entirely', () => {
    const plan = planDrafts([race, idNumber, why], [])
    const keys = [...plan.fromBank, ...plan.forAi].map((item) => item.key)
    expect(keys).toEqual(['why'])
  })

  it('takes salary and notice period only from the bank', () => {
    const plan = planDrafts([salary, notice], [])
    expect(plan.forAi).toEqual([])
    expect(plan.fromBank).toEqual([
      { key: 'salary', answer: '', source: 'bank', needsUserInput: true },
      { key: 'notice', answer: '', source: 'bank', needsUserInput: true },
    ])
  })

  it('reuses bank answers by category and maps them onto options', () => {
    const bank = [
      saved({ category: 'salary', question: 'Expected salary', answer: 'R45 000 per month CTC' }),
      saved({ category: 'notice_period', question: 'Notice', answer: '1 month' }),
    ]
    const plan = planDrafts([salary, notice], bank)
    expect(plan.fromBank.map((item) => item.answer)).toEqual(['R45 000 per month CTC', '1 month'])
  })

  it('never reuses a motivation answer written for another company', () => {
    const bank = [
      saved({ category: 'motivation', question: 'Why do you want to work at Initech?' }),
    ]
    expect(bankAnswerFor(why, bank)).toBeNull()
    expect(planDrafts([why], bank).forAi).toEqual([why])
  })

  it('skips bank answers that contain an SA ID number', () => {
    const bank = [saved({ category: 'other', question: 'Question', answer: '8001015009087' })]
    const plan = planDrafts([question({ key: 'q' })], bank)
    expect(plan.forAi.map((item) => item.key)).toEqual(['q'])
  })
})

describe('finalizeAiDrafts', () => {
  it('rejects answers outside the offered options and trims to maxLength', () => {
    const relocate = question({
      key: 'relocate',
      kind: 'radio',
      options: ['Yes', 'No'],
      category: 'relocation',
    })
    const short = question({ key: 'short', maxLength: 10 })
    const result = finalizeAiDrafts(
      [relocate, short],
      [
        { key: 'relocate', answer: 'Maybe' },
        { key: 'short', answer: 'A much longer answer than allowed' },
      ],
    )
    expect(result[0]).toEqual({ key: 'relocate', answer: '', source: 'ai', needsUserInput: true })
    expect(result[1].answer.length).toBeLessThanOrEqual(10)
  })

  it('treats missing or flagged answers as needing the candidate', () => {
    const result = finalizeAiDrafts([why], [{ key: 'why', answer: 'x', needsUserInput: true }])
    expect(result[0].needsUserInput).toBe(true)
    expect(finalizeAiDrafts([why], [])[0].needsUserInput).toBe(true)
  })
})

describe('draftAnswers', () => {
  it('sends only non-sensitive questions without bank answers to the AI', async () => {
    const ai = vi.fn(async (questions: QuestionInput[]) =>
      questions.map((item) => ({ key: item.key, answer: 'Drafted answer' })),
    )
    const result = await draftAnswers([why, salary, race], [], ai)
    expect(ai).toHaveBeenCalledWith([why])
    expect(result.map((item) => [item.key, item.source, item.needsUserInput])).toEqual([
      ['why', 'ai', false],
      ['salary', 'bank', true],
    ])
  })
})

describe('route schemas', () => {
  it('refuses to save sensitive questions or ID numbers', () => {
    expect(
      saveSchema.safeParse({
        answers: [{ questionKey: 'a', questionLabel: 'Gender', answer: 'x' }],
      }).success,
    ).toBe(false)
    expect(
      saveSchema.safeParse({
        answers: [{ questionKey: 'a', questionLabel: 'Anything else?', answer: '8001015009087' }],
      }).success,
    ).toBe(false)
    expect(
      saveSchema.safeParse({
        answers: [{ questionKey: 'a', questionLabel: 'Notice period', answer: '1 month' }],
      }).success,
    ).toBe(true)
  })

  it('caps the number of questions per draft', () => {
    expect(draftSchema.safeParse({ questions: [] }).success).toBe(false)
    const many = Array.from({ length: 51 }, (_, index) => ({
      key: `k${index}`,
      label: 'Q',
      kind: 'text',
    }))
    expect(draftSchema.safeParse({ questions: many }).success).toBe(false)
  })
})

describe('draftAnswerTexts', () => {
  afterEach(() => setAiClientForTests(null))

  it('sends question labels and context, and parses the reply', async () => {
    const create = vi.fn(async () => ({
      choices: [
        { message: { content: JSON.stringify({ answers: [{ key: 'why', answer: 'Because' }] }) } },
      ],
    }))
    setAiClientForTests({ chat: { completions: { create } } } as unknown as AiClient)

    const context: CandidateContext = {
      company: 'Acme',
      jobTitle: 'Engineer',
      jobDescription: 'Build things',
      job: null,
      resume: null,
      profile: { firstName: 'Jane', lastName: 'Doe', location: 'Cape Town' },
      savedAnswers: [],
      tailoredEdits: [],
    }
    const result = await draftAnswerTexts(context, [why])
    expect(result).toEqual([{ key: 'why', answer: 'Because' }])
    const payload = JSON.parse(
      (create.mock.calls[0] as unknown as [{ messages: Array<{ content: string }> }])[0]
        .messages[1].content,
    )
    expect(payload.questions[0]).toMatchObject({ key: 'why', label: why.label })
    expect(payload.company).toBe('Acme')
  })
})
