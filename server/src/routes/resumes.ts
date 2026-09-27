import { Router } from 'express'
import multer from 'multer'
import { getAuth } from '../middleware/auth.js'
import { getSupabaseAdmin } from '../middleware/auth.js'
import { parseResumeBuffer } from '../services/resumeParser.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
})

export const resumesRouter = Router()

resumesRouter.get('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

resumesRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const file = req.file
    if (!file) {
      res.status(400).json({ error: 'Resume file is required' })
      return
    }

    const parsed = await parseResumeBuffer(file.buffer, file.originalname, file.mimetype)

    const supabase = getSupabaseAdmin()
    const storagePath = `${user.id}/${Date.now()}-${file.originalname}`

    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      })

    if (uploadError) throw uploadError

    const { data, error } = await supabase
      .from('resumes')
      .insert({
        user_id: user.id,
        file_name: file.originalname,
        storage_path: storagePath,
        parsed_json: parsed,
        parsed_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

resumesRouter.delete('/:id', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const supabase = getSupabaseAdmin()
    const id = req.params.id

    const { data: existing, error: findError } = await supabase
      .from('resumes')
      .select('id, storage_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (findError) throw findError
    if (!existing) {
      res.status(404).json({ error: 'Resume not found' })
      return
    }

    await supabase.storage.from('resumes').remove([existing.storage_path])
    const { error } = await supabase.from('resumes').delete().eq('id', id).eq('user_id', user.id)
    if (error) throw error
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
