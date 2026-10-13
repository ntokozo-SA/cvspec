import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicantProfile, TailoredFile } from '../../shared/types'
import { attachShadows, emulateListboxes } from '../../test/dom'
import { allApplyFormAdapters } from './adapters'
import { deepQueryAll } from './dom'
import { fillAnswers, fillForm } from './fill'
import { listboxValue } from './questions'

/**
 * Hard constraint: filling never submits, never moves a wizard on and never touches passwords.
 * Runs the whole fill against every fixture with every adapter that recognises it.
 */
const fixtures = import.meta.glob<string>('./__fixtures__/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
})

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

const file: TailoredFile = { base64: btoa('PK docx'), fileName: 'cv.docx', unapplied: [] }

const ADVANCE_TEXT = /\b(?:submit|next|continue|apply|send|sign ?in|log ?in|save and)\b/i

describe('fill never submits', () => {
  const submits = vi.fn()
  const advanceClicks: string[] = []
  let stopListboxes = () => {}
  const onClick = (event: Event) => {
    const target = (event.target as Element | null)?.closest('button, input, a, [role="button"]')
    if (!target || target.getAttribute('aria-haspopup') === 'listbox') return
    const isSubmit =
      (target instanceof HTMLButtonElement && target.type === 'submit') ||
      (target instanceof HTMLInputElement && target.type === 'submit')
    if (isSubmit || ADVANCE_TEXT.test(target.textContent ?? '')) {
      advanceClicks.push(target.outerHTML.slice(0, 80))
    }
  }

  beforeEach(() => {
    submits.mockReset()
    advanceClicks.length = 0
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(submits)
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(submits)
    document.addEventListener('submit', submits, true)
    document.addEventListener('click', onClick, true)
    stopListboxes = emulateListboxes()
  })

  afterEach(() => {
    stopListboxes()
    vi.restoreAllMocks()
    document.removeEventListener('submit', submits, true)
    document.removeEventListener('click', onClick, true)
    document.body.innerHTML = ''
  })

  for (const [path, html] of Object.entries(fixtures)) {
    it(`leaves ${path.split('/').pop()} unsubmitted`, async () => {
      for (const adapter of allApplyFormAdapters) {
        document.body.innerHTML = html
        attachShadows()
        if (!adapter.isReady()) continue
        await fillForm(
          adapter,
          { profile, file, fileError: null },
          {
            settleMs: 0,
            coverLetter: {
              text: 'Dear Hiring Team,\n\nI would like to apply.',
              fetchFile: async (format) => ({ ...file, fileName: `letter.${format}` }),
            },
          },
        )
        const questions = adapter.questions()
        const answers = new Map(
          questions.map((question) => [question.key, question.options[0] ?? 'Yes'] as const),
        )
        await fillAnswers(questions, answers)

        expect(submits).not.toHaveBeenCalled()
        expect(advanceClicks).toEqual([])
        for (const question of questions.filter((item) => item.sensitive)) {
          for (const element of question.elements) {
            if (question.listbox) {
              expect(listboxValue(element), question.label).toBe('')
            } else if (
              element instanceof HTMLInputElement &&
              ['radio', 'checkbox'].includes(element.type)
            ) {
              expect(element.checked, question.label).toBe(false)
            } else {
              expect((element as HTMLInputElement).value, question.label).toBe('')
            }
          }
        }
        for (const password of deepQueryAll<HTMLInputElement>(document, 'input[type="password"]')) {
          expect(password.value).toBe('')
        }
      }
    })
  }
})
