import { Router } from 'express'
import { z } from 'zod'
import { getAuth } from '../middleware/auth.js'
import { getSupabaseAdmin } from '../middleware/auth.js'
import { ComparisonInputError, runComparison } from '../services/comparisonRunner.js'
import { DOCX_MIME_TYPE } from '../services/pdfToDocx.js'
import { applyRecommendationsToDocx, TailorInputError } from '../services/tailorResume.js'
import type { Recommendation } from '../types/index.js'

const bodySchema = z.object({
  resumeId: z.string().uuid(),
  jobSpecId: z.string().uuid(),
})

const tailorSchema = z.object({
  recommendations: z
    .array(z.number().int().nonnegative())
    .min(1, 'Choose at least one recommendation'),
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

/** Builds a tailored copy of the comparison's resume on demand. Nothing is stored. */
comparisonsRouter.post('/:id/tailored-resume', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const { recommendations: picked } = tailorSchema.parse(req.body)
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('comparisons')
      .select('recommendations, resume:resumes(file_name, storage_path)')
      .eq('id', req.params.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      res.status(404).json({ error: 'Comparison not found' })
      return
    }

    const resume = (Array.isArray(data.resume) ? data.resume[0] : data.resume) as {
      file_name: string
      storage_path: string
    } | null
    if (!resume) {
      res.status(404).json({ error: 'The resume for this comparison no longer exists' })
      return
    }
    if (!/\.docx$/i.test(resume.file_name)) {
      res.status(400).json({
        error:
          'Edits can only be applied to DOCX resumes. Upload this resume as a DOCX or a text-based PDF.',
      })
      return
    }

    const all = (data.recommendations ?? []) as Recommendation[]
    const indexes = [...new Set(picked)]
    if (indexes.some((index) => index >= all.length)) {
      res.status(400).json({ error: 'Unknown recommendation selected' })
      return
    }

    const { data: file, error: downloadError } = await supabase.storage
      .from('resumes')
      .download(resume.storage_path)
    if (downloadError) throw downloadError

    const result = await applyRecommendationsToDocx(
      Buffer.from(await file.arrayBuffer()),
      indexes.map((index) => all[index]),
    )
    const unapplied = result.unapplied.map((position) => indexes[position])
    if (unapplied.length === indexes.length) {
      res.status(422).json({
        error:
          'None of the selected edits could be matched to your resume. Copy them in manually instead.',
      })
      return
    }

    const fileName = `${resume.file_name.replace(/\.docx$/i, '')}-tailored.docx`
    res.setHeader('Content-Type', DOCX_MIME_TYPE)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    )
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Unapplied-Recommendations', unapplied.join(','))
    res.send(result.buffer)
  } catch (err) {
    if (err instanceof TailorInputError) {
      res.status(400).json({ error: err.message })
      return
    }
    next(err)
  }
})
