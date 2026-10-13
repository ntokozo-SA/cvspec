import { z } from 'zod'
import { aiModel, getClient } from './aiClient.js'
import type {
  JobSpecParsed,
  QuestionInput,
  Recommendation,
  ResumeParsed,
} from '../types/index.js'

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

/** What the AI may draw on when writing for a candidate. Nothing sensitive goes in here. */
export interface CandidateContext {
  company: string | null
  jobTitle: string | null
  jobDescription: string
  job: JobSpecParsed | null
  resume: ResumeParsed | null
  profile: { firstName: string | null; lastName: string | null; location: string | null }
  savedAnswers: Array<{ category: string; question: string; answer: string }>
  /** Resume edits the candidate chose for this job. */
  tailoredEdits: string[]
}

const draftedAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        key: z.string(),
        answer: z
          .string()
          .nullish()
          .transform((value) => value ?? ''),
        needsUserInput: z.boolean().optional(),
      }),
    )
    .default([]),
})

function contextPayload(context: CandidateContext) {
  return {
    company: context.company,
    jobTitle: context.jobTitle,
    job: context.job,
    jobDescription: context.jobDescription.slice(0, 8000),
    resume: context.resume,
    candidate: context.profile,
    savedAnswers: context.savedAnswers,
    tailoredEdits: context.tailoredEdits,
  }
}

export async function draftAnswerTexts(
  context: CandidateContext,
  questions: QuestionInput[],
): Promise<Array<{ key: string; answer: string; needsUserInput?: boolean }>> {
  const client = getClient()
  const completion = await client.chat.completions.create({
    model: aiModel(),
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'You draft answers to job application questions for a candidate. The candidate reviews and edits every answer before it is used.',
          'Return JSON: { "answers": [{ "key": string, "answer": string, "needsUserInput": boolean }] } with one entry per question, using the question keys given.',
          'Use only facts from the resume, candidate details, saved answers, chosen resume edits and the job posting. Never invent dates, salaries, notice periods, qualifications, licences, employers, numbers or personal circumstances.',
          'If a question depends on a fact you do not have, return an empty answer with needsUserInput true.',
          'For questions with options, the answer must be copied exactly from the options. For checkbox questions with several options, separate chosen options with "; ".',
          'Respect maxLength (characters) when given. Otherwise: one sentence for text questions, 80 to 150 words for textarea questions.',
          'For motivation questions, refer to the company and role specifically and connect them to real experience from the resume.',
          'Write in the first person, in plain professional English, without cliches or emojis.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          ...contextPayload(context),
          questions: questions.map(({ key, label, kind, options, maxLength, category }) => ({
            key,
            label,
            kind,
            options,
            maxLength,
            category,
          })),
        }),
      },
    ],
  })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('OpenAI returned an empty answers response')
  return draftedAnswersSchema.parse(JSON.parse(content)).answers
}

export type CoverLetterTone = 'professional' | 'warm' | 'concise'
export type CoverLetterLength = 'short' | 'medium' | 'long'

const LETTER_WORDS: Record<CoverLetterLength, string> = {
  short: '150 to 200',
  medium: '250 to 320',
  long: '350 to 450',
}

const coverLetterSchema = z.object({ coverLetter: z.string().min(1) })

export async function draftCoverLetter(
  context: CandidateContext,
  options: { tone: CoverLetterTone; length: CoverLetterLength },
): Promise<string> {
  const client = getClient()
  const completion = await client.chat.completions.create({
    model: aiModel(),
    temperature: 0.5,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'You write a tailored cover letter for a job application. The candidate edits it before sending.',
          'Return JSON: { "coverLetter": string }. Paragraphs are separated by a blank line.',
          'Start with a greeting to the hiring team (use the company name if known, never invent a person\'s name) and end with "Kind regards," followed by the candidate\'s name on the next line.',
          'Do not include an address block, date or contact details; those are added separately.',
          `Length: ${LETTER_WORDS[options.length]} words. Tone: ${options.tone}.`,
          'Connect two or three of the job\'s most important requirements to specific, real experience from the resume and the chosen resume edits. Mention the role and company specifically.',
          'Use only facts from the inputs. Never invent employers, metrics, dates, qualifications or reasons. No cliches, no emojis, no placeholders in square brackets.',
        ].join(' '),
      },
      { role: 'user', content: JSON.stringify(contextPayload(context)) },
    ],
  })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('OpenAI returned an empty cover letter')
  return coverLetterSchema.parse(JSON.parse(content)).coverLetter.trim().slice(0, 8000)
}
