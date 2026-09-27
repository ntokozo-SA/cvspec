import { Router } from 'express'
import { z } from 'zod'
import { getAuth, getSupabaseAdmin } from '../middleware/auth.js'
import {
  ComparisonInputError,
  findLatestParsedResumeId,
  runComparison,
} from '../services/comparisonRunner.js'
import { createJobSpecFromText } from '../services/jobSpecCreator.js'

const APPLICATION_SELECT =
  '*, job_spec:job_specs(id, source_url, parsed_json, created_at), comparison:comparisons(id, match_score, matched_skills, missing_skills, recommendations, resume_id, created_at)'

const createSchema = z.object({
  title: z.string().trim().max(300).optional(),
  company: z.string().trim().max(300).optional(),
  location: z.string().trim().max(300).optional(),
  url: z.string().url(),
  board: z.enum(['linkedin', 'indeed', 'glassdoor', 'other']),
  descriptionText: z.string().trim().min(40, 'Job description text is too short').max(60000),
  analyze: z.boolean().optional().default(true),
})

const updateSchema = z
  .object({
    status: z.enum(['saved', 'applied', 'interviewing', 'offer', 'rejected']).optional(),
    resumeId: z.string().uuid().nullable().optional(),
  })
  .refine((body) => body.status !== undefined || body.resumeId !== undefined, {
    message: 'Nothing to update',
  })

const analyzeSchema = z.object({
  resumeId: z.string().uuid().optional(),
})

export function normalizeJobUrl(raw: string): string {
  const url = new URL(raw)
  url.hash = ''
  const host = url.hostname.replace(/^www\./, '')

  if (host.endsWith('linkedin.com')) {
    const viewMatch = url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/)
    const jobId = viewMatch?.[1] ?? url.searchParams.get('currentJobId')
    if (jobId) return `https://www.linkedin.com/jobs/view/${jobId}/`
  }

  if (host.endsWith('indeed.com')) {
    const jobKey = url.searchParams.get('jk') ?? url.searchParams.get('vjk')
    if (jobKey) return `https://${url.hostname}/viewjob?jk=${jobKey}`
  }

  if (host.endsWith('glassdoor.com')) {
    const listingId = url.searchParams.get('jobListingId') ?? url.searchParams.get('jl')
    if (listingId) return `https://${url.hostname}/job-listing/?jl=${listingId}`
    url.search = ''
  }

  return url.toString()
}

async function linkComparison(
  userId: string,
  applicationId: string,
  resumeId: string,
  jobSpecId: string,
) {
  const comparison = await runComparison(userId, resumeId, jobSpecId)
  const { error } = await getSupabaseAdmin()
    .from('applications')
    .update({ comparison_id: comparison.id, resume_id: resumeId })
    .eq('id', applicationId)
    .eq('user_id', userId)
  if (error) throw error
  return comparison
}

export const applicationsRouter = Router()

applicationsRouter.get('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    let query = getSupabaseAdmin()
      .from('applications')
      .select(APPLICATION_SELECT)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (typeof req.query.url === 'string' && req.query.url) {
      query = query.eq('source_url', normalizeJobUrl(req.query.url))
    }

    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

applicationsRouter.post('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const body = createSchema.parse(req.body)
    const supabase = getSupabaseAdmin()
    const sourceUrl = normalizeJobUrl(body.url)

    const { data: existing, error: findError } = await supabase
      .from('applications')
      .select(APPLICATION_SELECT)
      .eq('user_id', user.id)
      .eq('source_url', sourceUrl)
      .maybeSingle()
    if (findError) throw findError
    if (existing) {
      res.json(existing)
      return
    }

    const header = [body.title, body.company, body.location].filter(Boolean).join(' | ')
    const jobSpec = await createJobSpecFromText({
      userId: user.id,
      sourceType: 'link',
      rawText: header ? `${header}\n\n${body.descriptionText}` : body.descriptionText,
      sourceUrl,
    })

    const { data, error } = await supabase
      .from('applications')
      .insert({
        user_id: user.id,
        job_spec_id: jobSpec.id,
        title: body.title || jobSpec.parsed_json?.title || null,
        company: body.company || null,
        location: body.location || null,
        board: body.board,
        source_url: sourceUrl,
      })
      .select(APPLICATION_SELECT)
      .single()
    if (error) throw error

    res.status(201).json(data)
    if (!body.analyze) return

    void (async () => {
      const resumeId = await findLatestParsedResumeId(user.id)
      if (!resumeId) return
      await linkComparison(user.id, data.id, resumeId, jobSpec.id)
    })().catch((err: unknown) => {
      console.error('[applications] background analysis failed', err)
    })
  } catch (err) {
    next(err)
  }
})

applicationsRouter.patch('/:id', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const body = updateSchema.parse(req.body)
    const patch: Record<string, unknown> = {}
    if (body.status !== undefined) {
      patch.status = body.status
      patch.status_updated_at = new Date().toISOString()
    }
    if (body.resumeId !== undefined) patch.resume_id = body.resumeId

    const { data, error } = await getSupabaseAdmin()
      .from('applications')
      .update(patch)
      .eq('id', req.params.id)
      .eq('user_id', user.id)
      .select(APPLICATION_SELECT)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      res.status(404).json({ error: 'Application not found' })
      return
    }
    res.json(data)
  } catch (err) {
    next(err)
  }
})

applicationsRouter.delete('/:id', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const { error, count } = await getSupabaseAdmin()
      .from('applications')
      .delete({ count: 'exact' })
      .eq('id', req.params.id)
      .eq('user_id', user.id)

    if (error) throw error
    if (!count) {
      res.status(404).json({ error: 'Application not found' })
      return
    }
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

applicationsRouter.post('/:id/analyze', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const body = analyzeSchema.parse(req.body ?? {})

    const { data: application, error } = await getSupabaseAdmin()
      .from('applications')
      .select('id, job_spec_id, resume_id')
      .eq('id', req.params.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error
    if (!application) {
      res.status(404).json({ error: 'Application not found' })
      return
    }

    const resumeId =
      body.resumeId ?? application.resume_id ?? (await findLatestParsedResumeId(user.id))
    if (!resumeId) {
      res.status(400).json({ error: 'Upload a resume in CVSpec before tailoring' })
      return
    }

    const comparison = await linkComparison(
      user.id,
      application.id,
      resumeId,
      application.job_spec_id,
    )
    res.status(201).json(comparison)
  } catch (err) {
    if (err instanceof ComparisonInputError) {
      res.status(400).json({ error: err.message })
      return
    }
    next(err)
  }
})
