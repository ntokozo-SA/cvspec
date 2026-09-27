import { Router } from 'express'
import { z } from 'zod'
import { getAuth } from '../middleware/auth.js'
import { getSupabaseAdmin } from '../middleware/auth.js'
import { ComparisonInputError, runComparison } from '../services/comparisonRunner.js'

const bodySchema = z.object({
  resumeId: z.string().uuid(),
  jobSpecId: z.string().uuid(),
})

export const comparisonsRouter = Router()

comparisonsRouter.get('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('comparisons')
      .select('*, resume:resumes(*), job_spec:job_specs(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

comparisonsRouter.get('/:id', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('comparisons')
      .select('*, resume:resumes(*), job_spec:job_specs(*)')
      .eq('id', req.params.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      res.status(404).json({ error: 'Comparison not found' })
      return
    }
    res.json(data)
  } catch (err) {
    next(err)
  }
})

comparisonsRouter.post('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const { resumeId, jobSpecId } = bodySchema.parse(req.body)
    const data = await runComparison(user.id, resumeId, jobSpecId)
    res.status(201).json(data)
  } catch (err) {
    if (err instanceof ComparisonInputError) {
      res.status(400).json({ error: err.message })
      return
    }
    next(err)
  }
})
