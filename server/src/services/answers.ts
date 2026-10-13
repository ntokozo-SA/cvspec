import type { DraftedAnswer, QuestionInput, SavedAnswer } from '../types/index.js'
import { isSensitiveQuestion, looksLikeSaId } from './sensitive.js'

/** Facts CVSpec must never guess: they come from the candidate's saved answers or not at all. */
const BANK_ONLY = new Set(['salary', 'notice_period'])

/** Bank answers reused by category alone, without a matching question label. */
const REUSE_BY_CATEGORY = new Set([
  'salary',
  'notice_period',
  'start_date',
  'relocation',
  'work_authorization',
  'referral_source',
])

const CHOICE_SEPARATOR = '; '

export interface RawDraft {
  key: string
  answer: string
  needsUserInput?: boolean
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2),
  )
}

export function labelOverlap(a: string, b: string): number {
  const left = words(a)
  const right = words(b)
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared / (left.size + right.size - shared)
}

const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

function containsPhrase(text: string, phrase: string): boolean {
  if (!phrase) return false
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`).test(text)
}

/** The option an answer refers to: exact, then whole-phrase containment, then yes/no. */
export function chooseOption(answer: string, options: string[]): string | null {
  const wanted = norm(answer)
  if (!wanted) return null
  const exact = options.find((option) => norm(option) === wanted)
  if (exact) return exact
  const contained = options.filter(
    (option) => containsPhrase(wanted, norm(option)) || containsPhrase(norm(option), wanted),
  )
  if (contained.length === 1) return contained[0]
  const polarity = /^(?:yes|y|true)\b/.test(wanted)
    ? 'yes'
    : /^(?:no|n|false)\b/.test(wanted)
      ? 'no'
      : null
  if (polarity) {
    const match = options.find((option) => new RegExp(`^${polarity}\\b`).test(norm(option)))
    if (match) return match
  }
  return null
}

/** Cuts text to `max` characters on a word boundary. */
export function fitLength(text: string, max: number | null): string {
  const trimmed = text.trim()
  if (!max || trimmed.length <= max) return trimmed
  const cut = trimmed.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trim()
}

/** Validates an answer against the question's kind; returns the cleaned answer or null. */
export function fitAnswer(question: QuestionInput, answer: string): string | null {
  if (looksLikeSaId(answer)) return null
  if (question.kind === 'select' || question.kind === 'radio') {
    return chooseOption(answer, question.options)
  }
  if (question.kind === 'checkbox') {
    if (question.options.length === 0) {
      return chooseOption(answer, ['Yes', 'No'])
    }
    const chosen = answer
      .split(/[;\n]/)
      .map((part) => chooseOption(part, question.options))
      .filter((option): option is string => option !== null)
    return chosen.length > 0 ? [...new Set(chosen)].join(CHOICE_SEPARATOR) : null
  }
  const fitted = fitLength(answer, question.maxLength)
  return fitted || null
}

export function bankAnswerFor(question: QuestionInput, bank: SavedAnswer[]): SavedAnswer | null {
  let best: SavedAnswer | null = null
  let bestScore = 0
  for (const saved of bank) {
    const score = labelOverlap(question.label, saved.question)
    if (score > bestScore) {
      best = saved
      bestScore = score
    }
  }
  if (best && bestScore >= 0.6 && question.category !== 'motivation') return best
  if (!REUSE_BY_CATEGORY.has(question.category)) return null
  const sameCategory = bank
    .filter((saved) => saved.category === question.category)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return sameCategory[0] ?? null
}

export interface DraftPlan {
  fromBank: DraftedAnswer[]
  /** Questions with no usable bank answer, to be drafted by AI. */
  forAi: QuestionInput[]
}

/** Drops sensitive questions, answers what it can from the bank and lists the rest for AI. */
export function planDrafts(questions: QuestionInput[], bank: SavedAnswer[]): DraftPlan {
  const plan: DraftPlan = { fromBank: [], forAi: [] }
  for (const question of questions) {
    if (isSensitiveQuestion(question.label)) continue
    const saved = bankAnswerFor(question, bank)
    const fitted = saved ? fitAnswer(question, saved.answer) : null
    if (fitted) {
      plan.fromBank.push({ key: question.key, answer: fitted, source: 'bank', needsUserInput: false })
    } else if (BANK_ONLY.has(question.category)) {
      plan.fromBank.push({ key: question.key, answer: '', source: 'bank', needsUserInput: true })
    } else {
      plan.forAi.push(question)
    }
  }
  return plan
}

/** Keeps only valid AI answers for the questions asked; anything unusable needs the candidate. */
export function finalizeAiDrafts(questions: QuestionInput[], raw: RawDraft[]): DraftedAnswer[] {
  const byKey = new Map(raw.map((draft) => [draft.key, draft]))
  return questions.map((question) => {
    const draft = byKey.get(question.key)
    const fitted = draft && !draft.needsUserInput ? fitAnswer(question, draft.answer ?? '') : null
    return fitted
      ? { key: question.key, answer: fitted, source: 'ai', needsUserInput: false }
      : { key: question.key, answer: '', source: 'ai', needsUserInput: true }
  })
}

export async function draftAnswers(
  questions: QuestionInput[],
  bank: SavedAnswer[],
  ai: (questions: QuestionInput[]) => Promise<RawDraft[]>,
): Promise<DraftedAnswer[]> {
  const plan = planDrafts(questions, bank)
  const drafted = plan.forAi.length > 0 ? finalizeAiDrafts(plan.forAi, await ai(plan.forAi)) : []
  const results = new Map(
    [...plan.fromBank, ...drafted].map((answer) => [answer.key, answer] as const),
  )
  return questions
    .map((question) => results.get(question.key))
    .filter((answer): answer is DraftedAnswer => answer !== undefined)
}
