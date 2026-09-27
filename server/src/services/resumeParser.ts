import type { ResumeParsed } from '../types/index.js'

const RESUMEPARSER_URL = 'https://resumeparser.app/resume/parse'

interface ResumeParserEmployment {
  title?: string | null
  company?: string | null
  responsibilities?: string[] | null
  roles?: Array<{ role?: string | null; responsibilities?: string[] | null }> | null
}

interface ResumeParserEducation {
  degree?: string | null
  institution_name?: string | null
}

interface ResumeParserResponse {
  parsed?: {
    name?: string | null
    title?: string | null
    brief?: string | null
    contact?: { email?: string | null } | null
    employment_history?: ResumeParserEmployment[] | null
    education?: ResumeParserEducation[] | null
    skills?: string[] | null
  }
  meta?: { message?: string }
  error?: string
  message?: string
}

function toStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : []
}

/** resumeparser.app — https://resumeparser.app */
export async function parseResumeBuffer(
  buffer: Buffer,
  fileName: string,
  mimeType?: string,
): Promise<ResumeParsed> {
  const apiKey = process.env.RESUMEPARSER_API_KEY
  if (!apiKey) throw new Error('RESUMEPARSER_API_KEY is not configured')

  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName)

  const response = await fetch(RESUMEPARSER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  const payload = (await response.json().catch(() => ({}))) as ResumeParserResponse

  if (!response.ok || !payload.parsed) {
    const detail = payload.error ?? payload.message ?? payload.meta?.message ?? ''
    throw new Error(`Resume parser failed (${response.status})${detail ? `: ${detail}` : ''}`)
  }

  const parsed = payload.parsed

  const experience = (parsed.employment_history ?? []).map((job) => ({
    title: job.title ?? '',
    company: job.company ?? '',
    bullets: [
      ...toStrings(job.responsibilities),
      ...(job.roles ?? []).flatMap((role) => toStrings(role.responsibilities)),
    ],
  }))

  const education = (parsed.education ?? [])
    .map((item) => [item.degree, item.institution_name].filter(Boolean).join(', '))
    .filter(Boolean)

  return {
    name: parsed.name ?? undefined,
    email: parsed.contact?.email ?? undefined,
    skills: toStrings(parsed.skills),
    experience,
    education,
    summary: parsed.brief ?? parsed.title ?? undefined,
  }
}
