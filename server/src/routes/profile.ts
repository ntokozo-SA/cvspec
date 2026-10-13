import { Router } from 'express'
import { z } from 'zod'
import { getAuth, getSupabaseAdmin } from '../middleware/auth.js'
import { isSensitiveQuestion, looksLikeSaId } from '../services/sensitive.js'
import {
  ANSWER_CATEGORIES,
  type AnswerCategory,
  type ApplicantProfile,
  type ResumeParsed,
  type SavedAnswer,
} from '../types/index.js'

const PROFILE_COLUMNS =
  'first_name, last_name, email, phone, location, linkedin_url, website_url, updated_at'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null))

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .optional()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || /^https?:\/\/\S+$/i.test(value), {
    message: 'Links must start with http:// or https://',
  })

const profileSchema = z.object({
  firstName: optionalText(100),
  lastName: optionalText(100),
  email: z
    .string()
    .trim()
    .max(320)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || z.string().email().safeParse(value).success, {
      message: 'Enter a valid email address',
    }),
  phone: optionalText(50),
  location: optionalText(200),
  linkedinUrl: optionalUrl,
  websiteUrl: optionalUrl,
})

interface ProfileRow {
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  location: string | null
  linkedin_url: string | null
  website_url: string | null
  updated_at: string | null
}

function toProfile(row: ProfileRow, saved: boolean): ApplicantProfile {
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    location: row.location,
    linkedinUrl: row.linkedin_url,
    websiteUrl: row.website_url,
    updatedAt: row.updated_at,
    saved,
  }
}

/** Defaults for users who have not saved a profile yet, taken from their latest parsed resume. */
async function profileDefaults(userId: string, accountEmail: string | undefined) {
  const { data, error } = await getSupabaseAdmin()
    .from('resumes')
    .select('parsed_json')
    .eq('user_id', userId)
    .not('parsed_json', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error

  const parsed = (data?.parsed_json ?? null) as ResumeParsed | null
  const [firstName = null, ...rest] = (parsed?.name ?? '').trim().split(/\s+/).filter(Boolean)
  return toProfile(
    {
      first_name: firstName,
      last_name: rest.length > 0 ? rest.join(' ') : null,
      email: parsed?.email ?? accountEmail ?? null,
      phone: null,
      location: null,
      linkedin_url: null,
      website_url: null,
      updated_at: null,
    },
    false,
  )
}

/** The saved profile, or defaults from the latest parsed resume. */
export async function loadProfile(
  userId: string,
  accountEmail: string | undefined,
): Promise<ApplicantProfile> {
  const { data, error } = await getSupabaseAdmin()
    .from('applicant_profiles')
    .select(PROFILE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? toProfile(data, true) : profileDefaults(userId, accountEmail)
}

const SAVED_ANSWER_COLUMNS = 'id, category, question, answer, updated_at'

interface SavedAnswerRow {
  id: string
  category: AnswerCategory
  question: string
  answer: string
  updated_at: string
}

export function toSavedAnswer(row: SavedAnswerRow): SavedAnswer {
  return {
    id: row.id,
    category: row.category,
    question: row.question,
    answer: row.answer,
    updatedAt: row.updated_at,
  }
}

export async function loadSavedAnswers(userId: string): Promise<SavedAnswer[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('saved_answers')
    .select(SAVED_ANSWER_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toSavedAnswer)
}

export const SENSITIVE_ANSWER_ERROR =
  "CVSpec doesn't store ID numbers or answers to employment-equity, health, criminal-record or other sensitive questions. Answer those on the form yourself."

const savedAnswerSchema = z
  .object({
    category: z.enum(ANSWER_CATEGORIES),
    question: z.string().trim().min(1, 'Enter the question').max(300),
    answer: z.string().trim().min(1, 'Enter an answer').max(4000),
  })
  .refine((body) => !isSensitiveQuestion(body.question) && !looksLikeSaId(body.answer), {
    message: SENSITIVE_ANSWER_ERROR,
  })

export const profileRouter = Router()

profileRouter.get('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    res.json(await loadProfile(user.id, user.email))
  } catch (err) {
    next(err)
  }
})

profileRouter.get('/answers', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    res.json(await loadSavedAnswers(user.id))
  } catch (err) {
    next(err)
  }
})

profileRouter.post('/answers', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const body = savedAnswerSchema.parse(req.body)
    const { data, error } = await getSupabaseAdmin()
      .from('saved_answers')
      .insert({ user_id: user.id, ...body })
      .select(SAVED_ANSWER_COLUMNS)
      .single()
    if (error) throw error
    res.status(201).json(toSavedAnswer(data))
  } catch (err) {
    next(err)
  }
})

profileRouter.put('/answers/:answerId', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const body = savedAnswerSchema.parse(req.body)
    const { data, error } = await getSupabaseAdmin()
      .from('saved_answers')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', req.params.answerId)
      .eq('user_id', user.id)
      .select(SAVED_ANSWER_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      res.status(404).json({ error: 'Saved answer not found' })
      return
    }
    res.json(toSavedAnswer(data))
  } catch (err) {
    next(err)
  }
})

profileRouter.delete('/answers/:answerId', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const { error, count } = await getSupabaseAdmin()
      .from('saved_answers')
      .delete({ count: 'exact' })
      .eq('id', req.params.answerId)
      .eq('user_id', user.id)
    if (error) throw error
    if (!count) {
      res.status(404).json({ error: 'Saved answer not found' })
      return
    }
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

profileRouter.put('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const body = profileSchema.parse(req.body)
    const { data, error } = await getSupabaseAdmin()
      .from('applicant_profiles')
      .upsert({
        user_id: user.id,
        first_name: body.firstName,
        last_name: body.lastName,
        email: body.email,
        phone: body.phone,
        location: body.location,
        linkedin_url: body.linkedinUrl,
        website_url: body.websiteUrl,
        updated_at: new Date().toISOString(),
      })
      .select(PROFILE_COLUMNS)
      .single()
    if (error) throw error

    res.json(toProfile(data, true))
  } catch (err) {
    next(err)
  }
})
