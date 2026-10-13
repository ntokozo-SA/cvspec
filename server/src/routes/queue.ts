import { Router } from 'express'
import { z } from 'zod'
import { getAuth, getSupabaseAdmin } from '../middleware/auth.js'
import { AI_LIMIT_MESSAGE, aiBudget } from '../middleware/rateLimit.js'
import { loadCandidateContext } from '../services/candidateContext.js'
import { ComparisonInputError, findLatestParsedResumeId } from '../services/comparisonRunner.js'
import { draftCoverLetter } from '../services/openai.js'
import { PrepareError, prepareApplication, type PrepareRow } from '../services/prepare.js'
import { APPLICATION_SELECT, linkComparison } from './applications.js'

export const MAX_QUEUE = 20

export const queueSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .max(MAX_QUEUE, `Queue up to ${MAX_QUEUE} jobs at a time`)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'A job is in the queue twice' }),
})

export const prepareSchema = z.object({ coverLetter: z.boolean().default(false) })

export interface QueueCandidate {
  id: string
  title: string | null
  status: string
  built_in_apply: boolean | null
}

/** Why these jobs can't be queued, or null when they all can. */
export function queueProblem(ids: string[], rows: QueueCandidate[]): string | null {
  const byId = new Map(rows.map((row) => [row.id, row]))
  if (ids.some((id) => !byId.has(id))) return 'Some of these jobs no longer exist in CVSpec'
  for (const id of ids) {
    const row = byId.get(id)!
    const name = row.title ?? 'This job'
    if (row.status !== 'saved') return `${name} is already marked as ${row.status}`
    if (row.built_in_apply) {
      return `${name} uses the job board's own application form. Apply there yourself.`
    }
  }
  return null
}

async function loadQueue(userId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('applications')
    .select(APPLICATION_SELECT)
    .eq('user_id', userId)
    .not('queue_position', 'is', null)
    .order('queue_position', { ascending: true })
  if (error) throw error
  return data
}

async function clearQueue(userId: string) {
  const { error } = await getSupabaseAdmin()
    .from('applications')
    .update({ queue_position: null, queued_at: null })
    .eq('user_id', userId)
    .not('queue_position', 'is', null)
  if (error) throw error
}

/** Mounted at /api/applications/queue, ahead of the /:id routes. */
export const queueRouter = Router()

queueRouter.get('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    res.json(await loadQueue(user.id))
  } catch (err) {
    next(err)
  }
})

queueRouter.put('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const { ids } = queueSchema.parse(req.body)
    const supabase = getSupabaseAdmin()

    if (ids.length > 0) {
      const { data, error } = await supabase
        .from('applications')
        .select('id, title, status, built_in_apply, queued_at')
        .eq('user_id', user.id)
        .in('id', ids)
      if (error) throw error
      const rows = (data ?? []) as Array<QueueCandidate & { queued_at: string | null }>
      const problem = queueProblem(ids, rows)
      if (problem) {
        res.status(400).json({ error: problem })
        return
      }

      const queuedAt = new Map(rows.map((row) => [row.id, row.queued_at]))
      const now = new Date().toISOString()
      await clearQueue(user.id)
      for (const [index, id] of ids.entries()) {
        const { error: updateError } = await supabase
          .from('applications')
          .update({ queue_position: index + 1, queued_at: queuedAt.get(id) ?? now })
          .eq('id', id)
          .eq('user_id', user.id)
        if (updateError) throw updateError
      }
    } else {
      await clearQueue(user.id)
    }

    res.json(await loadQueue(user.id))
  } catch (err) {
    next(err)
  }
})

queueRouter.delete('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    await clearQueue(user.id)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

const prepareBudget = aiBudget({ limit: 60 })

/** Mounted at /api/applications/:id/prepare. Safe to call repeatedly. */
export const prepareRouter = Router({ mergeParams: true })

prepareRouter.post('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const applicationId = (req.params as { id: string }).id
    const options = prepareSchema.parse(req.body ?? {})
    const supabase = getSupabaseAdmin()

    const { data: row, error } = await supabase
      .from('applications')
      .select(
        'id, job_spec_id, resume_id, comparison_id, tailored_comparison_id, tailored_recommendations, cover_letter',
      )
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error
    if (!row) {
      res.status(404).json({ error: 'Application not found' })
      return
    }

    const update = async (patch: Record<string, unknown>) => {
      const { error: updateError } = await supabase
        .from('applications')
        .update(patch)
        .eq('id', applicationId)
        .eq('user_id', user.id)
      if (updateError) throw updateError
    }

    const steps = await prepareApplication(row as PrepareRow, options, {
      findResumeId: () => findLatestParsedResumeId(user.id),
      analyze: async (resumeId) => {
        const comparison = await linkComparison(user.id, applicationId, resumeId, row.job_spec_id)
        const recommendations = comparison.recommendations as unknown[] | null
        return { id: comparison.id as string, recommendationCount: recommendations?.length ?? 0 }
      },
      recommendationCount: async (comparisonId) => {
        const { data, error: comparisonError } = await supabase
          .from('comparisons')
          .select('recommendations')
          .eq('id', comparisonId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (comparisonError) throw comparisonError
        return Array.isArray(data?.recommendations) ? data.recommendations.length : 0
      },
      draftCoverLetter: async () => {
        const loaded = await loadCandidateContext(user.id, user.email, applicationId)
        if (!loaded?.context.resume) {
          throw new PrepareError(400, 'Upload a resume in CVSpec before drafting a cover letter')
        }
        return draftCoverLetter(loaded.context, { tone: 'professional', length: 'medium' })
      },
      update,
      spendAi: () => prepareBudget.take(user.id) === null,
    })

    const { data, error: loadError } = await supabase
      .from('applications')
      .select(APPLICATION_SELECT)
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .single()
    if (loadError) throw loadError
    res.json({ application: data, steps })
  } catch (err) {
    if (err instanceof PrepareError) {
      res.status(err.status).json({ error: err.status === 429 ? AI_LIMIT_MESSAGE : err.message })
      return
    }
    if (err instanceof ComparisonInputError) {
      res.status(400).json({ error: err.message })
      return
    }
    next(err)
  }
})
