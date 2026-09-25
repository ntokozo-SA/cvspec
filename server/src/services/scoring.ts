import type { JobSpecParsed, ResumeParsed, ScoreResult } from '../types/index.js'

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function skillMatches(resumeSkill: string, requiredSkill: string): boolean {
  const a = normalize(resumeSkill)
  const b = normalize(requiredSkill)
  return a === b || a.includes(b) || b.includes(a)
}

export function scoreResumeAgainstJob(
  resume: ResumeParsed,
  job: JobSpecParsed,
): ScoreResult {
  const required = job.requiredSkills ?? []
  const resumeSkills = resume.skills ?? []

  const matchedSkills: string[] = []
  const missingSkills: string[] = []

  for (const requiredSkill of required) {
    const hit = resumeSkills.some((skill) => skillMatches(skill, requiredSkill))
    if (hit) matchedSkills.push(requiredSkill)
    else missingSkills.push(requiredSkill)
  }

  const matchScore =
    required.length === 0 ? 0 : Math.round((matchedSkills.length / required.length) * 100)

  return { matchScore, matchedSkills, missingSkills }
}
