import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { getAuth } from '../middleware/auth.js'
import { getSupabaseAdmin } from '../middleware/auth.js'
import { extractTextFromDocument } from '../services/documentText.js'
import { extractTextFromUrl } from '../services/linkExtractor.js'
import { extractJobSpec } from '../services/openai.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
})

const jsonBodySchema = z.object({
  sourceType: z.enum(['link', 'document', 'text']),
  text: z.string().optional(),
  url: z.string().url().optional(),
})

export const jobSpecsRouter = Router()

jobSpecsRouter.get('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('job_specs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

jobSpecsRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const supabase = getSupabaseAdmin()

    const sourceType =
      typeof req.body.sourceType === 'string' ? req.body.sourceType : undefined

    let rawText = ''
    let sourceUrl: string | null = null
    let storagePath: string | null = null
    let resolvedType: 'link' | 'document' | 'text'

    if (req.file) {
      resolvedType = 'document'
      rawText = await extractTextFromDocument(req.file.buffer, req.file.originalname)
      storagePath = `${user.id}/${Date.now()}-${req.file.originalname}`
      const { error: uploadError } = await supabase.storage
        .from('job-specs')
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        })
      if (uploadError) throw uploadError
    } else {
      const body = jsonBodySchema.parse({
        sourceType,
        text: req.body.text,
        url: req.body.url,
      })
      resolvedType = body.sourceType

      if (resolvedType === 'text') {
        if (!body.text || body.text.trim().length < 40) {
          res.status(400).json({ error: 'Paste at least a short job description' })
          return
        }
        rawText = body.text
      } else if (resolvedType === 'link') {
        if (!body.url) {
          res.status(400).json({ error: 'url is required for link job specs' })
          return
        }
        sourceUrl = body.url
        rawText = await extractTextFromUrl(body.url)
      } else {
        res.status(400).json({ error: 'Document uploads require a file' })
        return
      }
    }

    const parsed = await extractJobSpec(rawText)

    const { data, error } = await supabase
      .from('job_specs')
      .insert({
        user_id: user.id,
        source_type: resolvedType,
        source_url: sourceUrl,
        storage_path: storagePath,
        raw_text: rawText,
        parsed_json: parsed,
      })
      .select('*')
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

jobSpecsRouter.delete('/:id', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const supabase = getSupabaseAdmin()
    const id = req.params.id

    const { data: existing, error: findError } = await supabase
      .from('job_specs')
      .select('id, storage_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (findError) throw findError
    if (!existing) {
      res.status(404).json({ error: 'Job spec not found' })
      return
    }

    if (existing.storage_path) {
      await supabase.storage.from('job-specs').remove([existing.storage_path])
    }

    const { error } = await supabase
      .from('job_specs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
