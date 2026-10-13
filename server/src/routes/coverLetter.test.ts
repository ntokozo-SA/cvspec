import type { AddressInfo } from 'node:net'
import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
}))

vi.mock('../middleware/auth.js', () => {
  const query = () => {
    const chain = {
      select: () => chain,
      update: (values: Record<string, unknown>) => {
        state.updates.push(values)
        if (state.row) state.row = { ...state.row, ...values }
        return chain
      },
      eq: () => chain,
      maybeSingle: async () => ({ data: state.row, error: null }),
    }
    return chain
  }
  return {
    getAuth: (req: unknown) => req,
    getSupabaseAdmin: () => ({ from: query }),
  }
})

vi.mock('../services/candidateContext.js', () => ({
  loadApplicationRow: async () => state.row,
  loadCandidateContext: async () => null,
}))

vi.mock('./profile.js', () => ({
  loadProfile: async () => ({
    firstName: 'Thandi',
    lastName: 'Nkosi',
    email: 'thandi@example.com',
    phone: null,
    location: 'Durban',
    linkedinUrl: null,
    websiteUrl: null,
  }),
}))

const { coverLetterRouter } = await import('./coverLetter.js')

let baseUrl = ''
let server: ReturnType<express.Express['listen']>

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    Object.assign(req, { user: { id: 'user-1', email: 'thandi@example.com' } })
    next()
  })
  app.use('/api/applications/:id/cover-letter', coverLetterRouter)
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err instanceof ZodError) {
        res.status(400).json({ error: err.issues[0]?.message })
        return
      }
      res.status(500).json({ error: String(err) })
    },
  )
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve)
  })
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/applications/app-1/cover-letter`
})

afterAll(() => {
  server?.close()
})

beforeEach(() => {
  state.updates = []
  state.row = {
    id: 'app-1',
    company: 'Nedbank',
    cover_letter: 'Dear Hiring Team,\n\nI would like to apply.',
    cover_letter_updated_at: '2026-10-13T08:00:00Z',
  }
})

describe('cover letter routes', () => {
  it('returns the saved letter', async () => {
    const res = await fetch(baseUrl)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      coverLetter: 'Dear Hiring Team,\n\nI would like to apply.',
      updatedAt: '2026-10-13T08:00:00Z',
    })
  })

  it('returns 404 when the application is not the user’s', async () => {
    state.row = null
    expect((await fetch(baseUrl)).status).toBe(404)
  })

  it('rejects letters that are too long or contain an SA ID number', async () => {
    const put = (coverLetter: string) =>
      fetch(baseUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverLetter }),
      })
    expect((await put('x'.repeat(8001))).status).toBe(400)
    const withId = await put('My ID is 8001015009087.')
    expect(withId.status).toBe(400)
    expect((await withId.json()).error).toMatch(/ID number/)
    expect(state.updates).toHaveLength(0)
  })

  it('saves an edited letter and clears an empty one', async () => {
    const save = await fetch(baseUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverLetter: '  Edited letter  ' }),
    })
    expect(save.status).toBe(200)
    expect(state.updates[0]?.cover_letter).toBe('Edited letter')

    await fetch(baseUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverLetter: '   ' }),
    })
    expect(state.updates[1]).toEqual({ cover_letter: null, cover_letter_updated_at: null })
  })

  it('builds a DOCX or PDF on request without caching', async () => {
    const docx = await fetch(`${baseUrl}/file?format=docx`, { method: 'POST' })
    expect(docx.status).toBe(200)
    expect(docx.headers.get('content-type')).toContain('wordprocessingml')
    expect(docx.headers.get('cache-control')).toBe('no-store')
    expect(docx.headers.get('content-disposition')).toContain(
      'Thandi-Nkosi-cover-letter-Nedbank.docx',
    )

    const pdf = await fetch(`${baseUrl}/file?format=pdf`, { method: 'POST' })
    expect(pdf.headers.get('content-type')).toBe('application/pdf')
    const bytes = Buffer.from(await pdf.arrayBuffer())
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('rejects unknown formats and missing letters', async () => {
    expect((await fetch(`${baseUrl}/file?format=rtf`, { method: 'POST' })).status).toBe(400)
    state.row = { ...state.row, cover_letter: null }
    expect((await fetch(`${baseUrl}/file`, { method: 'POST' })).status).toBe(404)
  })

  it('returns 404 from draft when the application is missing', async () => {
    const res = await fetch(`${baseUrl}/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tone: 'warm', length: 'short' }),
    })
    expect(res.status).toBe(404)
  })

  it('rejects unknown tones', async () => {
    const res = await fetch(`${baseUrl}/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tone: 'sarcastic' }),
    })
    expect(res.status).toBe(400)
  })
})
