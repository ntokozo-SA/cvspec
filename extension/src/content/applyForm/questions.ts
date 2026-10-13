import { isSensitiveQuestion } from '../../shared/sensitive'
import type { AnswerCategory, QuestionPayload, SavedAnswer } from '../../shared/types'
import { cleanLabel, CONFIRM_EMAIL, describe, labelText, questionLabel } from './adapters/labels'
import type { CustomQuestion } from './adapters/types'
import { deepQueryAll, isVisible } from './dom'

const TEXT_TYPES = new Set(['', 'text', 'email', 'tel', 'url', 'number', 'date', 'month'])
const SKIPPED_TYPES = new Set([
  'hidden',
  'file',
  'password',
  'submit',
  'button',
  'reset',
  'image',
  'search',
])

/** Consent and declarations are the candidate's to give. */
const CONSENT =
  /\b(?:i agree|i accept|i consent|i confirm|i declare|i certify|i understand|i acknowledge|terms|privacy (?:policy|notice|statement)|consent|popia)\b/i

/** Contact details of other people (referees, emergency contacts) are never filled. */
const OTHER_PERSON_CONTACT =
  /\b(?:referr?(?:er|al)|reference|referee|emergency|supervisor|manager)'?s?\b.*\b(?:name|e-?mail|phone|number|contact)\b/i

const COVER_LETTER = /\bcover(?:ing)? letter\b/i

const RACE_OPTIONS = /^(?:african|black|coloured|colored|indian|asian|white|chinese)\b/i
const GENDER_OPTIONS = /^(?:male|female|man|woman|non-binary|nonbinary)\b/i

const CATEGORY_RULES: Array<[AnswerCategory, RegExp]> = [
  [
    'salary',
    /\b(?:salary|remuneration|compensation|ctc|cost to company|pay expectation|expected (?:pay|package)|rate expectation|desired pay|hourly rate)\b/i,
  ],
  ['notice_period', /\bnotice(?: period)?\b/i],
  [
    'start_date',
    /\b(?:start date|earliest (?:start|date|available)|when (?:can|could) you start|available to start|availability to start|date available)\b/i,
  ],
  ['relocation', /\brelocat/i],
  [
    'work_authorization',
    /\b(?:authori[sz]ed to work|(?:allowed|entitled|permitted) to work|work(?:ing)? (?:permit|visa|authori[sz]ation)|right to work|eligible to work|require (?:visa )?sponsorship|sponsorship|citizen(?:ship)?|permanent resident)\b/i,
  ],
  [
    'referral_source',
    /\b(?:how did you (?:hear|find|learn)|where did you (?:hear|see|find)|how did you come across|source of application)\b/i,
  ],
  [
    'motivation',
    /\b(?:why (?:do you want|are you interested|are you applying|this|us|join|should we|would you like)|what (?:interests|excites|attracts|motivates) you|motivat|tell us about yourself|why .* (?:company|role|position|us))\b/i,
  ],
]

export function categorize(label: string): AnswerCategory {
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(label)) return category
  }
  return 'other'
}

/** FNV-1a, enough to give each question label a short stable key. */
function hash(text: string): string {
  let value = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 0x01000193)
  }
  return (value >>> 0).toString(16).padStart(8, '0')
}

export function questionKey(system: string, label: string): string {
  return `${system}:${hash(label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())}`
}

export function optionLabel(input: HTMLInputElement): string {
  const text =
    labelText(input).trim() || input.getAttribute('aria-label') || input.value || ''
  return cleanLabel(text)
}

function selectOptions(select: HTMLSelectElement): string[] {
  return Array.from(select.options)
    .filter(
      (option) =>
        option.value !== '' &&
        !option.disabled &&
        !/^(?:select|choose|please (?:select|choose)|-+)\b/i.test(option.text.trim()),
    )
    .map((option) => option.text.trim())
    .filter(Boolean)
}

function optionsLookSensitive(options: string[]): boolean {
  const race = options.filter((option) => RACE_OPTIONS.test(option)).length
  const gender = options.filter((option) => GENDER_OPTIONS.test(option)).length
  return race >= 2 || gender >= 2
}

/** The question a radio or checkbox group asks: legend, group label, or the nearest label above. */
function groupLabel(inputs: HTMLInputElement[]): string {
  const first = inputs[0]
  const legend = first.closest('fieldset')?.querySelector('legend')
  if (legend?.textContent?.trim()) return cleanLabel(legend.textContent)

  const group = first.closest<HTMLElement>('[role="radiogroup"], [role="group"]')
  if (group) {
    const label = questionLabel(group)
    if (label) return label
  }

  const optionLabels = inputs.flatMap((input) => Array.from(input.labels ?? []))
  const own = new Set<Element>(inputs)
  let container = first.parentElement
  for (let depth = 0; container && depth < 4; depth += 1) {
    const controls = Array.from(container.querySelectorAll('input, select, textarea'))
    if (controls.some((control) => !own.has(control))) break
    if (inputs.every((input) => container?.contains(input))) {
      const candidates = Array.from(
        container.querySelectorAll<HTMLElement>('label, legend, [class*="label" i], p, span'),
      ).filter(
        (element) =>
          !optionLabels.some((label) => label.contains(element)) &&
          !inputs.some((input) => element.contains(input)) &&
          element.textContent?.trim(),
      )
      if (candidates[0]) return cleanLabel(candidates[0].textContent ?? '')
    }
    container = container.parentElement
  }
  return inputs.length === 1 ? optionLabel(first) : ''
}

function isRequired(element: HTMLElement, rawLabel: string): boolean {
  return (
    (element as HTMLInputElement).required ||
    element.getAttribute('aria-required') === 'true' ||
    /[*✱]/.test(rawLabel)
  )
}

function rawLabelOf(element: HTMLElement): string {
  return element.closest('fieldset')?.querySelector('legend')?.textContent ?? labelText(element)
}

/**
 * Custom questions inside `root`, in page order. Skips contact fields (`exclude`), file and
 * password inputs, hidden fields and honeypots, consent boxes, comboboxes, other people's contact
 * details and cover-letter boxes. Sensitive questions are returned flagged, never answered.
 */
export function collectQuestions(
  root: ParentNode,
  system: string,
  exclude: Iterable<Element | undefined>,
  options: {
    /** Custom dropdown buttons to collect as listbox questions (Workday). */
    listboxSelector?: string
    /** Every question on this page is sensitive (Workday's voluntary disclosure steps). */
    allSensitive?: boolean
  } = {},
): CustomQuestion[] {
  const { listboxSelector, allSensitive = false } = options
  const excluded = new Set(Array.from(exclude).filter(Boolean))
  const seenGroups = new Set<string>()
  const usedKeys = new Map<string, number>()
  const questions: CustomQuestion[] = []

  const push = (question: Omit<CustomQuestion, 'key' | 'category' | 'sensitive'>, hint: string) => {
    if (!question.label) return
    const sensitive =
      allSensitive ||
      isSensitiveQuestion(question.label) ||
      isSensitiveQuestion(hint) ||
      optionsLookSensitive(question.options)
    let key = questionKey(system, question.label)
    const seen = usedKeys.get(key) ?? 0
    usedKeys.set(key, seen + 1)
    if (seen > 0) key = `${key}-${seen + 1}`
    questions.push({ ...question, key, sensitive, category: categorize(question.label) })
  }

  const selector = ['input, textarea, select', listboxSelector].filter(Boolean).join(', ')
  for (const element of deepQueryAll<HTMLElement>(root, selector)) {
    if (excluded.has(element)) continue
    if ((element as HTMLInputElement).disabled) continue

    if (listboxSelector && element.matches(listboxSelector)) {
      if (!isVisible(element)) continue
      const label = questionLabel(element)
      if (OTHER_PERSON_CONTACT.test(label)) continue
      push(
        {
          label,
          kind: 'text',
          options: [],
          required: isRequired(element, labelText(element)),
          maxLength: 200,
          elements: [element],
          listbox: true,
        },
        describe(element),
      )
      continue
    }

    if (element.getAttribute('role') === 'combobox') continue

    if (element instanceof HTMLInputElement && ['radio', 'checkbox'].includes(element.type)) {
      const groupId = element.name || `#${questions.length}-${element.id}`
      if (seenGroups.has(groupId)) continue
      seenGroups.add(groupId)
      const inputs = element.name
        ? deepQueryAll<HTMLInputElement>(
            element.form ?? root,
            `input[name="${CSS.escape(element.name)}"]`,
          ).filter((input) => input.type === element.type)
        : [element]
      const visible = inputs.some(
        (input) =>
          isVisible(input) || Array.from(input.labels ?? []).some((label) => isVisible(label)),
      )
      if (!visible) continue
      const label = groupLabel(inputs)
      const single = element.type === 'checkbox' && inputs.length === 1
      if (single && CONSENT.test(`${label} ${optionLabel(element)}`)) continue
      if (!single && CONSENT.test(label)) continue
      push(
        {
          label,
          kind: element.type === 'radio' ? 'radio' : 'checkbox',
          options: single ? [] : inputs.map(optionLabel),
          required: inputs.some((input) => isRequired(input, rawLabelOf(input))),
          maxLength: null,
          elements: inputs,
        },
        describe(element),
      )
      continue
    }

    if (element instanceof HTMLInputElement) {
      if (SKIPPED_TYPES.has(element.type) || !TEXT_TYPES.has(element.type)) continue
      if (element.readOnly) continue
    }
    if (element instanceof HTMLTextAreaElement && element.readOnly) continue
    if (!isVisible(element)) continue

    const label = questionLabel(element)
    const hint = describe(element)
    if (OTHER_PERSON_CONTACT.test(label)) continue
    if (CONFIRM_EMAIL.test(hint)) continue
    if (element instanceof HTMLTextAreaElement && COVER_LETTER.test(hint)) continue

    const isSelect = element instanceof HTMLSelectElement
    const maxLength = isSelect ? -1 : (element as HTMLInputElement | HTMLTextAreaElement).maxLength
    push(
      {
        label,
        kind: isSelect ? 'select' : element instanceof HTMLTextAreaElement ? 'textarea' : 'text',
        options: isSelect ? selectOptions(element) : [],
        required: isRequired(element, labelText(element)),
        maxLength: maxLength > 0 ? maxLength : null,
        elements: [element],
      },
      hint,
    )
  }
  return questions
}

/** The option a custom dropdown button shows, or '' while it shows its "Select One" prompt. */
export function listboxValue(button: HTMLElement): string {
  const text = (button.textContent ?? '').replace(/\s+/g, ' ').trim()
  return /^(?:select|choose|please (?:select|choose))\b|^-+$/i.test(text) ? '' : text
}

export function isAnswered(question: CustomQuestion): boolean {
  if (question.listbox) return question.elements[0] ? listboxValue(question.elements[0]) !== '' : false
  if (question.kind === 'radio' || question.kind === 'checkbox') {
    return question.elements.some((element) => (element as HTMLInputElement).checked)
  }
  const [element] = question.elements as Array<HTMLInputElement | HTMLSelectElement>
  return (element?.value ?? '').trim() !== ''
}

export function toPayload(question: CustomQuestion): QuestionPayload {
  const { key, label, kind, options, maxLength, category, required } = question
  return { key, label, kind, options, maxLength, category, required }
}

const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

function containsPhrase(text: string, phrase: string): boolean {
  if (!phrase) return false
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`).test(text)
}

/** The option an answer refers to: exact, then whole-phrase containment, then yes or no. */
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

/** Options chosen by an answer; checkbox answers separate options with ";". */
export function chosenOptions(question: Pick<CustomQuestion, 'kind' | 'options'>, answer: string) {
  const options = question.options.length > 0 ? question.options : ['Yes', 'No']
  const parts = question.kind === 'checkbox' ? answer.split(/[;\n]/) : [answer]
  return [
    ...new Set(
      parts
        .map((part) => chooseOption(part, options))
        .filter((option): option is string => option !== null),
    ),
  ]
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2),
  )
}

function labelOverlap(a: string, b: string): number {
  const left = words(a)
  const right = words(b)
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared / (left.size + right.size - shared)
}

const REUSE_BY_CATEGORY = new Set<AnswerCategory>([
  'salary',
  'notice_period',
  'start_date',
  'relocation',
  'work_authorization',
  'referral_source',
])

/**
 * A saved answer for the question, by similar label or by category. Motivation answers are
 * company-specific, so they are never reused. Mirrors server/src/services/answers.ts.
 */
export function matchBank(
  question: Pick<CustomQuestion, 'label' | 'kind' | 'options' | 'category'>,
  bank: SavedAnswer[],
): string | null {
  if (question.category === 'motivation') return null
  let best: SavedAnswer | null = null
  let bestScore = 0
  for (const saved of bank) {
    const score = labelOverlap(question.label, saved.question)
    if (score > bestScore) {
      best = saved
      bestScore = score
    }
  }
  const saved =
    best && bestScore >= 0.6
      ? best
      : REUSE_BY_CATEGORY.has(question.category)
        ? ([...bank]
            .filter((item) => item.category === question.category)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null)
        : null
  if (!saved) return null
  if (question.kind === 'text' || question.kind === 'textarea') return saved.answer
  const chosen = chosenOptions(question, saved.answer)
  return chosen.length > 0 ? chosen.join('; ') : null
}
