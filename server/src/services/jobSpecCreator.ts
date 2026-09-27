import { getSupabaseAdmin } from '../middleware/auth.js'
import { extractJobSpec } from './openai.js'

export interface CreateJobSpecInput {
  userId: string
  sourceType: 'link' | 'document' | 'text'
  rawText: string
  sourceUrl?: string | null
  storagePath?: string | null
}

export async function createJobSpecFromText(input: CreateJobSpecInput) {
  const supabase = getSupabaseAdmin()
  const parsed = await extractJobSpec(input.rawText)

  const { data, error } = await supabase
    .from('job_specs')
    .insert({
      user_id: input.userId,
      source_type: input.sourceType,
      source_url: input.sourceUrl ?? null,
      storage_path: input.storagePath ?? null,
      raw_text: input.rawText,
      parsed_json: parsed,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}
