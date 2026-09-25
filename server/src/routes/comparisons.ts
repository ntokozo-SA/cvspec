import { Router } from 'express'
import { z } from 'zod'
import { getAuth } from '../middleware/auth.js'
import { getSupabaseAdmin } from '../middleware/auth.js'
import { generateRecommendations } from '../services/openai.js'
import { scoreResumeAgainstJob } from '../services/scoring.js'
import type { JobSpecParsed, ResumeParsed } from '../types/index.js'

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
    const supabase = getSupabaseAdmin()

    const [{ data: resume, error: resumeError }, { data: jobSpec, error: jobError }] =
      await Promise.all([
        supabase
          .from('resumes')
          .select('*')
          .eq('id', resumeId)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('job_specs')
          .select('*')
          .eq('id', jobSpecId)
          .eq('user_id', user.id)
          .maybeSingle(),
      ])

    if (resumeError) throw resumeError
    if (jobError) throw jobError
    if (!resume?.parsed_json || !jobSpec?.parsed_json) {
      res.status(400).json({ error: 'Resume and job spec must both be parsed first' })
      return
    }

    const resumeParsed = resume.parsed_json as ResumeParsed
    const jobParsed = jobSpec.parsed_json as JobSpecParsed
    const score = scoreResumeAgainstJob(resumeParsed, jobParsed)
    const recommendations = await generateRecommendations({
      resume: resumeParsed,
      job: jobParsed,
      matchedSkills: score.matchedSkills,
      missingSkills: score.missingSkills,
    })

    const { data, error } = await supabase
      .from('comparisons')
      .insert({
        user_id: user.id,
        resume_id: resumeId,
        job_spec_id: jobSpecId,
        match_score: score.matchScore,
        matched_skills: score.matchedSkills,
        missing_skills: score.missingSkills,
        recommendations,
      })
      .select('*, resume:resumes(*), job_spec:job_specs(*)')
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})
