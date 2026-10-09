import { Router } from 'express'
import multer from 'multer'
import { getAuth } from '../middleware/auth.js'
import { getSupabaseAdmin } from '../middleware/auth.js'
import { parseResumeBuffer } from '../services/resumeParser.js'
import {
  convertPdfToDocx,
  DOCX_MIME_TYPE,
  isPdfBuffer,
  PdfHasNoTextError,
} from '../services/pdfToDocx.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
})

export const resumesRouter = Router()

async function convertIfPdf(buffer: Buffer): Promise<Buffer | null> {
  if (!isPdfBuffer(buffer)) return null
  try {
    return await convertPdfToDocx(buffer)
  } catch (err) {
    if (err instanceof PdfHasNoTextError) {
      console.warn('Resume PDF has no text layer; storing the PDF without conversion')
      return null
    }
    throw err
  }
}

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

    const [parsed, docxBuffer] = await Promise.all([
      parseResumeBuffer(file.buffer, file.originalname, file.mimetype),
      convertIfPdf(file.buffer),
    ])

    const supabase = getSupabaseAdmin()
    const pathPrefix = `${user.id}/${Date.now()}-`
    const originalPath = `${pathPrefix}${file.originalname}`
    const uploads: Array<{ path: string; body: Buffer; contentType: string }> = [
      { path: originalPath, body: file.buffer, contentType: file.mimetype },
    ]

    let fileName = file.originalname
    let storagePath = originalPath
    if (docxBuffer) {
      fileName = `${file.originalname.replace(/\.pdf$/i, '')}.docx`
      storagePath = `${pathPrefix}${fileName}`
      uploads.push({ path: storagePath, body: docxBuffer, contentType: DOCX_MIME_TYPE })
    }

    const uploadedPaths: string[] = []
    try {
      for (const item of uploads) {
        const { error: uploadError } = await supabase.storage
          .from('resumes')
          .upload(item.path, item.body, { contentType: item.contentType, upsert: false })
        if (uploadError) throw uploadError
        uploadedPaths.push(item.path)
      }

      const { data, error } = await supabase
        .from('resumes')
        .insert({
          user_id: user.id,
          file_name: fileName,
          storage_path: storagePath,
          original_file_name: docxBuffer ? file.originalname : null,
          original_storage_path: docxBuffer ? originalPath : null,
          parsed_json: parsed,
          parsed_at: new Date().toISOString(),
        })
        .select('*')
        .single()

      if (error) throw error
      res.status(201).json(data)
    } catch (err) {
      if (uploadedPaths.length > 0) await supabase.storage.from('resumes').remove(uploadedPaths)
      throw err
    }
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
      .select('id, storage_path, original_storage_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (findError) throw findError
    if (!existing) {
      res.status(404).json({ error: 'Resume not found' })
      return
    }

    const paths = [existing.storage_path, existing.original_storage_path].filter(
      (path): path is string => Boolean(path),
    )
    await supabase.storage.from('resumes').remove(paths)
    const { error } = await supabase.from('resumes').delete().eq('id', id).eq('user_id', user.id)
    if (error) throw error
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
