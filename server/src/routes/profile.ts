import { Router } from 'express'
import { z } from 'zod'
import { getAuth, getSupabaseAdmin } from '../middleware/auth.js'
import type { ApplicantProfile, ResumeParsed } from '../types/index.js'

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

export const profileRouter = Router()

profileRouter.get('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const { data, error } = await getSupabaseAdmin()
      .from('applicant_profiles')
      .select(PROFILE_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error

    res.json(data ? toProfile(data, true) : await profileDefaults(user.id, user.email))
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
