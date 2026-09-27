import OpenAI from 'openai'
import { z } from 'zod'
import type { JobSpecParsed, Recommendation, ResumeParsed } from '../types/index.js'

/** Accepts 3, "3", "3+ years" or "3-5 years" (lower bound); anything else becomes undefined. */
const lenientYears = z.preprocess((value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const match = value.match(/\d+(?:\.\d+)?/)
    return match ? Number(match[0]) : undefined
  }
  return undefined
}, z.number().optional())

const jobSpecSchema = z.object({
  title: z
    .string()
    .nullish()
    .transform((value) => value?.trim() || undefined),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  yearsExperience: lenientYears,
  responsibilities: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
})

const recommendationsSchema = z.object({
  recommendations: z.array(
    z.object({
      section: z.string(),
      original: z
        .string()
        .nullish()
        .transform((value) => value?.trim() || undefined),
      suggestion: z.string(),
      rationale: z.string(),
    }),
  ),
})

const skillVerdictSchema = z.object({
  index: z.coerce.number().int(),
  evidence: z.string().optional(),
  met: z.boolean(),
})

const skillMatchSchema = z.object({
  required: z.array(skillVerdictSchema).default([]),
  preferred: z.array(skillVerdictSchema).default([]),
})

function getClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not configured')
  return new OpenAI({ apiKey: key })
}

export async function extractJobSpec(rawText: string): Promise<JobSpecParsed> {
  const client = getClient()
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Extract structured hiring requirements from a job posting. Return JSON with title, requiredSkills, preferredSkills, yearsExperience, responsibilities, keywords. Be concise and specific. Prefer concrete skills over soft traits.',
      },
      {
        role: 'user',
        content: rawText.slice(0, 20000),
      },
    ],
  })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('OpenAI returned an empty job-spec response')
  return jobSpecSchema.parse(JSON.parse(content))
}

/** Returns the indices of `required` / `preferred` that the resume demonstrates. */
export async function matchSkills(input: {
  resume: ResumeParsed
  required: string[]
  preferred: string[]
}): Promise<{ matchedRequired: number[]; matchedPreferred: number[] }> {
  const client = getClient()
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    temperature: 0,
    seed: 7,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are an experienced recruiter screening a resume against job requirements. For each requirement, decide whether the resume gives reasonable evidence the candidate has it, the way a human recruiter would. Use the skills list, job titles, experience bullets and summary. Synonyms and equivalent wording count (e.g. "Technical Recruitment" meets "Technical hiring experience"; "Candidate Sourcing" meets "Sourcing candidates"). Qualifiers such as "cold", "full-cycle" or a named example tool in parentheses do not need to be stated word for word if the core skill is clearly present. A substring alone is not evidence ("Java" does not meet "JavaScript"). Return JSON: { "required": [{ "index": number, "evidence": string, "met": boolean }], "preferred": [same shape] } with one entry per input requirement. Keep evidence under 15 words.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          resume: input.resume,
          required: input.required.map((skill, index) => ({ index, skill })),
          preferred: input.preferred.map((skill, index) => ({ index, skill })),
        }),
      },
    ],
  })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('OpenAI returned an empty skill-match response')
  const parsed = skillMatchSchema.parse(JSON.parse(content))
  if (parsed.required.length !== input.required.length) {
    throw new Error('OpenAI skill-match response did not cover every required skill')
  }
  const metIndices = (verdicts: z.infer<typeof skillVerdictSchema>[], length: number) => [
    ...new Set(
      verdicts
        .filter((verdict) => verdict.met && verdict.index >= 0 && verdict.index < length)
        .map((verdict) => verdict.index),
    ),
  ]
  return {
    matchedRequired: metIndices(parsed.required, input.required.length),
    matchedPreferred: metIndices(parsed.preferred, input.preferred.length),
  }
}

export async function generateRecommendations(input: {
  resume: ResumeParsed
  job: JobSpecParsed
  matchedSkills: string[]
  missingSkills: string[]
}): Promise<Recommendation[]> {
  const client = getClient()
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You write specific resume edit recommendations. Return JSON: { "recommendations": [{ "section", "original", "suggestion", "rationale" }] }. When an edit rewrites an existing resume line, copy that line word for word into "original" and put the full replacement text in "suggestion". When the edit adds something new, omit "original" and write the exact text to add in "suggestion". Suggestions must be bullet-level and ready to paste. Never invent fake metrics. Never use emojis.',
      },
      {
        role: 'user',
        content: JSON.stringify(input),
      },
    ],
  })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('OpenAI returned an empty recommendations response')
  return recommendationsSchema.parse(JSON.parse(content)).recommendations
}
