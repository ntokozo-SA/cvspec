import { describe, expect, it } from 'vitest'
import { isSensitiveQuestion, looksLikeSaId, sensitiveKind } from './sensitive.js'

describe('isSensitiveQuestion', () => {
  it.each([
    ['ID Number*', 'identity_number'],
    ['South African ID number', 'identity_number'],
    ['Identity document number', 'identity_number'],
    ['Passport number', 'identity_number'],
    ['Population group', 'race'],
    ['Race', 'race'],
    ['Employment Equity: designated group', 'race'],
    ['Gender', 'gender'],
    ['Sex', 'gender'],
    ['Do you have a disability?', 'disability_health'],
    ['Do you have any chronic medical condition?', 'disability_health'],
    ['Do you have a criminal record?', 'criminal_record'],
    ['Have you ever been convicted of an offence?', 'criminal_record'],
    ['Religion', 'beliefs_membership'],
    ['Are you a trade union member?', 'beliefs_membership'],
    ['Veteran status', 'other_special'],
  ])('flags %s', (label, kind) => {
    expect(sensitiveKind(label)).toBe(kind)
  })

  it.each([
    'Why do you want to work at Acme?',
    'Salary expectation (CTC per annum)',
    'Notice period',
    'Are you willing to relocate?',
    'Are you a South African citizen or permanent resident?',
    'How did you hear about this role?',
    'Android developer experience (years)',
    'Experience in the health sector',
    'Candidate ID',
  ])('does not flag %s', (label) => {
    expect(isSensitiveQuestion(label)).toBe(false)
  })
})

describe('looksLikeSaId', () => {
  it('finds a valid ID number, with or without spaces', () => {
    expect(looksLikeSaId('8001015009087')).toBe(true)
    expect(looksLikeSaId('My ID is 800101 5009 087.')).toBe(true)
  })

  it('rejects bad check digits, impossible dates and other numbers', () => {
    expect(looksLikeSaId('8001015009088')).toBe(false)
    expect(looksLikeSaId('8013015009087')).toBe(false)
    expect(looksLikeSaId('+27 82 123 4567')).toBe(false)
    expect(looksLikeSaId('R45 000 per month')).toBe(false)
  })
})
