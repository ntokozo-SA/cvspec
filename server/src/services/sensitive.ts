/**
 * Questions CVSpec never reads, sends, stores or fills (POPIA special personal information,
 * identity numbers and employment-equity questions). Mirrored in
 * extension/src/shared/sensitive.ts; keep the two in step.
 */
export type SensitiveKind =
  | 'identity_number'
  | 'race'
  | 'gender'
  | 'disability_health'
  | 'criminal_record'
  | 'beliefs_membership'
  | 'other_special'

const RULES: Array<[SensitiveKind, RegExp]> = [
  [
    'identity_number',
    /\b(?:sa |south african |national )?id(?:entity)?[\s-]*(?:number|no\b|nr\b|#|document)|\bsa id\b|\bpassport\b|\bsocial security\b|\bssn\b/,
  ],
  [
    'race',
    /\brace\b|\bracial\b|\bethnic|\bpopulation group\b|\bdesignated group\b|\bemployment equity\b|\bee (?:status|information|category)\b|\bhispanic\b|\blatino\b/,
  ],
  ['gender', /\bgender\b|\bsex\b|\bsexual\b|\btransgender\b|\bpronouns?\b/],
  [
    'disability_health',
    /\bdisab|\bimpairment\b|\bhealth (?:condition|status|issue|problem)s?\b|\bmedical (?:condition|history)\b|\bchronic (?:illness|condition|medication)\b|\bpregnan/,
  ],
  [
    'criminal_record',
    /\bcriminal\b|\bconvict|\bfelon|\bcriminal offen[cs]e\b|\bbeen arrested\b|\bpending (?:charges|cases)\b/,
  ],
  ['beliefs_membership', /\breligio|\btrade union\b|\bunion member|\bpolitical\b/],
  ['other_special', /\bveteran\b|\bmarital status\b|\bbiometric\b|\bfingerprint/],
]

function normalize(text: string): string {
  return text.replace(/[*:_]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function sensitiveKind(label: string): SensitiveKind | null {
  const text = normalize(label)
  for (const [kind, pattern] of RULES) {
    if (pattern.test(text)) return kind
  }
  return null
}

export function isSensitiveQuestion(label: string): boolean {
  return sensitiveKind(label) !== null
}

function luhnValid(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

function validBirthDate(digits: string): boolean {
  const year = 2000 + Number(digits.slice(0, 2))
  const month = Number(digits.slice(2, 4))
  const day = Number(digits.slice(4, 6))
  if (month < 1 || month > 12 || day < 1) return false
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** True when the text contains a South African ID number: YYMMDD, 7 digits, Luhn check digit. */
export function looksLikeSaId(value: string): boolean {
  for (const match of value.matchAll(/\d[\d -]{11,18}\d/g)) {
    const digits = match[0].replace(/[ -]/g, '')
    if (digits.length !== 13) continue
    if (!['0', '1', '2'].includes(digits[10])) continue
    if (validBirthDate(digits) && luhnValid(digits)) return true
  }
  return false
}
