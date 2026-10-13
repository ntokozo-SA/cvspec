import { Router } from 'express'
import { z } from 'zod'
import { getAuth, getSupabaseAdmin } from '../middleware/auth.js'
import { aiRateLimit } from '../middleware/rateLimit.js'
import { draftAnswers } from '../services/answers.js'
import { loadApplicationRow, loadCandidateContext } from '../services/candidateContext.js'
import { draftAnswerTexts } from '../services/openai.js'
import { isSensitiveQuestion, looksLikeSaId } from '../services/sensitive.js'
import {
  ANSWER_CATEGORIES,
  type AnswerSource,
  type ApplicationAnswer,
  type QuestionInput,
} from '../types/index.js'
import { SENSITIVE_ANSWER_ERROR } from './profile.js'

const ANSWER_COLUMNS = 'question_key, question_label, answer, source, updated_at'

interface AnswerRow {
  question_key: string
  question_label: string
  answer: string
  source: AnswerSource
  updated_at: string
}

function toAnswer(row: AnswerRow): ApplicationAnswer {
  return {
    questionKey: row.question_key,
    questionLabel: row.question_label,
    answer: row.answer,
    source: row.source,
    updatedAt: row.updated_at,
  }
}

export const questionSchema = z.object({
  key: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(300),
  kind: z.enum(['text', 'textarea', 'select', 'radio', 'checkbox']),
  options: z.array(z.string().trim().max(300)).max(100).default([]),
  maxLength: z.number().int().positive().max(20000).nullable().default(null),
  category: z.enum(ANSWER_CATEGORIES).default('other'),
  required: z.boolean().default(false),
})

export const draftSchema = z.object({
  questions: z.array(questionSchema).min(1, 'No questions to answer').max(50),
})

export const saveSchema = z.object({
  answers: z
    .array(
      z.object({
        questionKey: z.string().trim().min(1).max(200),
        questionLabel: z.string().trim().min(1).max(300),
        answer: z.string().max(4000),
        source: z.enum(['bank', 'ai', 'user']).default('user'),
      }),
    )
    .max(100)
    .refine(
      (answers) =>
        answers.every(
          (item) => !isSensitiveQuestion(item.questionLabel) && !looksLikeSaId(item.answer),
        ),
      { message: SENSITIVE_ANSWER_ERROR },
    ),
})

async function listAnswers(userId: string, applicationId: string): Promise<ApplicationAnswer[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('application_answers')
    .select(ANSWER_COLUMNS)
    .eq('application_id', applicationId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toAnswer)
}

/** Mounted at /api/applications/:id/answers. */
export const answersRouter = Router({ mergeParams: true })

answersRouter.get('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const applicationId = (req.params as { id: string }).id
    if (!(await loadApplicationRow(user.id, applicationId))) {
      res.status(404).json({ error: 'Application not found' })
      return
    }
    res.json(await listAnswers(user.id, applicationId))
  } catch (err) {
    next(err)
  }
})

answersRouter.put('/', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const applicationId = (req.params as { id: string }).id
    const body = saveSchema.parse(req.body)
    if (!(await loadApplicationRow(user.id, applicationId))) {
      res.status(404).json({ error: 'Application not found' })
      return
    }

    const supabase = getSupabaseAdmin()
    const now = new Date().toISOString()
    const keep = body.answers.filter((item) => item.answer.trim() !== '')
    const clear = body.answers.filter((item) => item.answer.trim() === '')
    if (keep.length > 0) {
      const { error } = await supabase.from('application_answers').upsert(
        keep.map((item) => ({
          application_id: applicationId,
          user_id: user.id,
          question_key: item.questionKey,
          question_label: item.questionLabel,
          answer: item.answer.trim(),
          source: item.source,
          updated_at: now,
        })),
      )
      if (error) throw error
    }
    if (clear.length > 0) {
      const { error } = await supabase
        .from('application_answers')
        .delete()
        .eq('application_id', applicationId)
        .eq('user_id', user.id)
        .in(
          'question_key',
          clear.map((item) => item.questionKey),
        )
      if (error) throw error
    }
    res.json(await listAnswers(user.id, applicationId))
  } catch (err) {
    next(err)
  }
})

answersRouter.post('/draft', aiRateLimit(), async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    const applicationId = (req.params as { id: string }).id
    const { questions } = draftSchema.parse(req.body)
    const loaded = await loadCandidateContext(user.id, user.email, applicationId)
    if (!loaded) {
      res.status(404).json({ error: 'Application not found' })
      return
    }

    const existing = await listAnswers(user.id, applicationId)
    const edited = new Set(
      existing.filter((answer) => answer.source === 'user').map((answer) => answer.questionKey),
    )
    const toDraft = (questions as QuestionInput[]).filter((question) => !edited.has(question.key))
    const drafted = await draftAnswers(toDraft, loaded.bank, (forAi) =>
      draftAnswerTexts(loaded.context, forAi),
    )

    const labels = new Map(toDraft.map((question) => [question.key, question.label]))
    const now = new Date().toISOString()
    const rows = drafted
      .filter((answer) => answer.answer !== '')
      .map((answer) => ({
        application_id: applicationId,
        user_id: user.id,
        question_key: answer.key,
        question_label: labels.get(answer.key) ?? answer.key,
        answer: answer.answer,
        source: answer.source,
        updated_at: now,
      }))
    if (rows.length > 0) {
      const { error } = await getSupabaseAdmin().from('application_answers').upsert(rows)
      if (error) throw error
    }

    const kept = existing
      .filter((answer) => edited.has(answer.questionKey))
      .filter((answer) => questions.some((question) => question.key === answer.questionKey))
      .map((answer) => ({
        key: answer.questionKey,
        answer: answer.answer,
        source: 'user' as const,
        needsUserInput: false,
      }))
    res.json({ answers: [...kept, ...drafted] })
  } catch (err) {
    next(err)
  }
})
