import { matchSkills } from './openai.js'
import type { JobSpecParsed, ResumeParsed, ScoreResult } from '../types/index.js'

const REQUIRED_WEIGHT = 0.8
const PREFERRED_WEIGHT = 0.2
const TOKEN_MATCH_RATIO = 0.6

const STOPWORDS = new Set([
  'a',
  'ability',
  'an',
  'and',
  'as',
  'at',
  'comparable',
  'demonstrated',
  'equivalent',
  'experience',
  'experienced',
  'familiarity',
  'for',
  'good',
  'in',
  'knowledge',
  'of',
  'on',
  'or',
  'plus',
  'proficiency',
  'proficient',
  'proven',
  'similar',
  'skill',
  'skills',
  'solid',
  'strong',
  'the',
  'to',
  'understanding',
  'using',
  'with',
  'working',
  'year',
  'years',
])

function stem(token: string): string {
  let word = token
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) word = word.slice(0, -1)
  for (const suffix of ['ment', 'ing', 'ion', 'ed', 'er']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      word = word.slice(0, -suffix.length)
      break
    }
  }
  if (word.length > 3 && word.endsWith('e')) word = word.slice(0, -1)
  return word
}

/** Splits into whole-word tokens, keeping names like c++, c#, node.js intact. */
function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9+#.]+/)
    .map((token) => token.replace(/^\.+|\.+$/g, ''))
    .filter((token) => token !== '' && !STOPWORDS.has(token))
    .map(stem)
}

function skillTokens(skill: string): string[] {
  const withoutAside = tokenize(skill.replace(/\([^)]*\)/g, ' '))
  return withoutAside.length > 0 ? withoutAside : tokenize(skill)
}

function resumeTokens(resume: ResumeParsed): Set<string> {
  const text = [
    ...(resume.skills ?? []),
    ...(resume.experience ?? []).flatMap((job) => [job.title, ...(job.bullets ?? [])]),
    resume.summary ?? '',
  ].join(' ')
  return new Set(tokenize(text))
}

function ruleMatches(skills: string[], tokens: Set<string>): boolean[] {
  return skills.map((skill) => {
    const wanted = skillTokens(skill)
    if (wanted.length === 0) return false
    const hits = wanted.filter((token) => tokens.has(token)).length
    return hits / wanted.length >= TOKEN_MATCH_RATIO
  })
}

function computeScore(requiredHits: boolean[], preferredHits: boolean[]): number {
  const ratio = (hits: boolean[]) => hits.filter(Boolean).length / hits.length
  if (requiredHits.length > 0 && preferredHits.length > 0) {
    return Math.round(
      (REQUIRED_WEIGHT * ratio(requiredHits) + PREFERRED_WEIGHT * ratio(preferredHits)) * 100,
    )
  }
  if (requiredHits.length > 0) return Math.round(ratio(requiredHits) * 100)
  if (preferredHits.length > 0) return Math.round(ratio(preferredHits) * 100)
  return 0
}

export async function scoreResumeAgainstJob(
  resume: ResumeParsed,
  job: JobSpecParsed,
): Promise<ScoreResult> {
  const required = job.requiredSkills ?? []
  const preferred = job.preferredSkills ?? []

  const tokens = resumeTokens(resume)
  const requiredHits = ruleMatches(required, tokens)
  const preferredHits = ruleMatches(preferred, tokens)

  // The model's verdicts vary between runs, so the rule matches act as a floor.
  try {
    const ai = await matchSkills({ resume, required, preferred })
    for (const index of ai.matchedRequired) requiredHits[index] = true
    for (const index of ai.matchedPreferred) preferredHits[index] = true
  } catch (err) {
    console.warn('[scoring] AI skill match failed, using rules only:', (err as Error).message)
  }

  const listed = required.length > 0 ? required : preferred
  const listedHits = required.length > 0 ? requiredHits : preferredHits

  return {
    matchScore: computeScore(requiredHits, preferredHits),
    matchedSkills: listed.filter((_, index) => listedHits[index]),
    missingSkills: listed.filter((_, index) => !listedHits[index]),
  }
}
