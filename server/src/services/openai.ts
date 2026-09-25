import OpenAI from 'openai'
import { z } from 'zod'
import type { JobSpecParsed, Recommendation, ResumeParsed } from '../types/index.js'

const jobSpecSchema = z.object({
  title: z.string().optional(),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  yearsExperience: z.number().optional(),
  responsibilities: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
})

const recommendationsSchema = z.object({
  recommendations: z.array(
    z.object({
      section: z.string(),
      suggestion: z.string(),
      rationale: z.string(),
    }),
  ),
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
          'You write specific resume edit recommendations. Return JSON: { "recommendations": [{ "section", "suggestion", "rationale" }] }. Suggestions must be bullet-level and actionable. Never invent fake metrics. Never use emojis.',
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
