import { Router } from 'express'
import { z } from 'zod'
import { getAuth, getSupabaseAdmin } from '../middleware/auth.js'
import { aiRateLimit } from '../middleware/rateLimit.js'
import { loadApplicationRow, loadCandidateContext } from '../services/candidateContext.js'
import {
  buildCoverLetterDocx,
  buildCoverLetterPdf,
  coverLetterFileName,
  PDF_MIME_TYPE,
} from '../services/coverLetterFile.js'
import { draftCoverLetter } from '../services/openai.js'
import { DOCX_MIME_TYPE } from '../services/pdfToDocx.js'
import { looksLikeSaId } from '../services/sensitive.js'
import { loadProfile } from './profile.js'

export const MAX_COVER_LETTER = 8000

export const draftLetterSchema = z.object({
  tone: z.enum(['professional', 'warm', 'concise']).default('professional'),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
})

export const saveLetterSchema = z.object({
  coverLetter: z
    .string()
    .max(MAX_COVER_LETTER, `Keep the cover letter under ${MAX_COVER_LETTER} characters`)
    .refine((text) => !looksLikeSaId(text), {
      message: "Remove your ID number from the cover letter. CVSpec doesn't store ID numbers.",
    }),
})

export const fileQuerySchema = z.object({ format: z.enum(['docx', 'pdf']).default('docx') })

async function storeLetter(userId: string, applicationId: string, text: string | null) {
  const { data, error } = await getSupabaseAdmin()
    .from('applications')
    .update({ cover_letter: text, cover_letter_updated_at: text ? new Date().toISOString() : null })
    .eq('id', applicationId)
    .eq('user_id', userId)
    .select('cover_letter, cover_letter_updated_at')
    .maybeSingle()
  if (error) throw error
  return data
}

function toBody(row: { cover_letter: string | null; cover_letter_updated_at: string | null }) {
  return { coverLetter: row.cover_letter, updatedAt: row.cover_letter_updated_at }
}

/** Mounted at /api/applications/:id/cover-letter. Files are built per request, never stored. */
export const coverLetterRouter = Router({ mergeParams: true })

coverLetterRouter.get('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const { data, error } = await getSupabaseAdmin()
      .from('applications')
      .select('cover_letter, cover_letter_updated_at')
      .eq('id', (req.params as { id: string }).id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      res.status(404).json({ error: 'Application not found' })
      return
    }
    res.json(toBody(data))
  } catch (err) {
    next(err)
  }
})

coverLetterRouter.put('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const { coverLetter } = saveLetterSchema.parse(req.body)
    const data = await storeLetter(
      user.id,
      (req.params as { id: string }).id,
      coverLetter.trim() || null,
    )
    if (!data) {
      res.status(404).json({ error: 'Application not found' })
      return
    }
    res.json(toBody(data))
  } catch (err) {
    next(err)
  }
})

coverLetterRouter.post('/draft', aiRateLimit(), async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const applicationId = (req.params as { id: string }).id
    const options = draftLetterSchema.parse(req.body ?? {})
    const loaded = await loadCandidateContext(user.id, user.email, applicationId)
    if (!loaded) {
      res.status(404).json({ error: 'Application not found' })
      return
    }
    if (!loaded.context.resume) {
      res.status(400).json({ error: 'Upload a resume in CVSpec before drafting a cover letter' })
      return
    }
    const text = await draftCoverLetter(loaded.context, options)
    const data = await storeLetter(user.id, applicationId, text)
    if (!data) {
      res.status(404).json({ error: 'Application not found' })
      return
    }
    res.json(toBody(data))
  } catch (err) {
    next(err)
  }
})

coverLetterRouter.post('/file', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const { format } = fileQuerySchema.parse(req.query)
    const application = await loadApplicationRow(user.id, (req.params as { id: string }).id)
    if (!application) {
      res.status(404).json({ error: 'Application not found' })
      return
    }
    if (!application.cover_letter?.trim()) {
      res.status(404).json({ error: 'Write or generate a cover letter for this job first' })
      return
    }

    const profile = await loadProfile(user.id, user.email)
    const input = { text: application.cover_letter, profile }
    const buffer =
      format === 'pdf' ? await buildCoverLetterPdf(input) : await buildCoverLetterDocx(input)
    const fileName = coverLetterFileName(profile, application.company, format)
    res.setHeader('Content-Type', format === 'pdf' ? PDF_MIME_TYPE : DOCX_MIME_TYPE)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    )
    res.setHeader('Cache-Control', 'no-store')
    res.send(buffer)
  } catch (err) {
    next(err)
  }
})
