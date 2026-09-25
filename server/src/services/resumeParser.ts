import type { ResumeParsed } from '../types/index.js'

/**
 * resumeparser.com integration seam.
 * Confirm request/response schema against current provider docs before production use.
 */
export async function parseResumeBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<ResumeParsed> {
  const apiKey = process.env.RESUMEPARSER_API_KEY
  if (!apiKey) {
    // Local/dev fallback so the pipeline remains testable without the third-party key.
    return {
      name: fileName.replace(/\.[^.]+$/, ''),
      skills: [],
      experience: [],
      summary: 'Parsed locally without RESUMEPARSER_API_KEY. Configure the key for real parsing.',
    }
  }

  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(buffer)]), fileName)

  const response = await fetch('https://api.resumeparser.com/v1/parse', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  })

  if (!response.ok) {
    throw new Error(`Resume parser failed (${response.status})`)
  }

  const payload = (await response.json()) as Record<string, unknown>
  const skills = Array.isArray(payload.skills)
    ? payload.skills.map(String)
    : Array.isArray((payload as { Skills?: unknown }).Skills)
      ? ((payload as { Skills: unknown[] }).Skills).map(String)
      : []

  return {
    name: typeof payload.name === 'string' ? payload.name : undefined,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    skills,
    experience: [],
    summary: typeof payload.summary === 'string' ? payload.summary : undefined,
  }
}
