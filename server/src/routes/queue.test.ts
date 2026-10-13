import { describe, expect, it, vi } from 'vitest'
import { prepareApplication, PrepareError, type PrepareDeps, type PrepareRow } from '../services/prepare.js'

vi.mock('../middleware/auth.js', () => ({
  getAuth: (req: unknown) => req,
  getSupabaseAdmin: () => {
    throw new Error('not used')
  },
}))

const { queueProblem, queueSchema } = await import('./queue.js')

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('queueSchema', () => {
  it('accepts up to 20 distinct jobs', () => {
    const ids = Array.from({ length: 20 }, (_, index) => ID(index + 1))
    expect(queueSchema.parse({ ids }).ids).toHaveLength(20)
  })

  it('rejects more than 20, duplicates and non-ids', () => {
    const many = Array.from({ length: 21 }, (_, index) => ID(index + 1))
    expect(queueSchema.safeParse({ ids: many }).success).toBe(false)
    expect(queueSchema.safeParse({ ids: [ID(1), ID(1)] }).success).toBe(false)
    expect(queueSchema.safeParse({ ids: ['abc'] }).success).toBe(false)
  })
})

describe('queueProblem', () => {
  const saved = { id: ID(1), title: 'Analyst', status: 'saved', built_in_apply: false }

  it('allows saved jobs that use an external form', () => {
    expect(queueProblem([ID(1)], [saved])).toBeNull()
    expect(queueProblem([ID(1)], [{ ...saved, built_in_apply: null }])).toBeNull()
  })

  it('rejects missing, applied and built-in apply jobs', () => {
    expect(queueProblem([ID(1), ID(2)], [saved])).toMatch(/no longer exist/)
    expect(queueProblem([ID(1)], [{ ...saved, status: 'applied' }])).toMatch(/already marked/)
    expect(queueProblem([ID(1)], [{ ...saved, built_in_apply: true }])).toMatch(
      /board's own application form/,
    )
  })
})

function fakeDeps(row: PrepareRow, overrides: Partial<PrepareDeps> = {}) {
  const calls: string[] = []
  const deps: PrepareDeps = {
    findResumeId: async () => 'resume-1',
    analyze: async () => {
      calls.push('analyze')
      Object.assign(row, { comparison_id: 'cmp-1' })
      return { id: 'cmp-1', recommendationCount: 3 }
    },
    recommendationCount: async () => 3,
    draftCoverLetter: async () => {
      calls.push('draft')
      return 'Dear Hiring Team'
    },
    update: async (patch) => {
      calls.push(`update:${Object.keys(patch).join(',')}`)
      Object.assign(row, patch)
    },
    spendAi: () => true,
    ...overrides,
  }
  return { deps, calls }
}

describe('prepareApplication', () => {
  const blank = (): PrepareRow => ({
    resume_id: null,
    comparison_id: null,
    tailored_comparison_id: null,
    tailored_recommendations: null,
    cover_letter: null,
  })

  it('scores, tailors and drafts once, then does nothing on a second call', async () => {
    const row = blank()
    const { deps, calls } = fakeDeps(row)

    const first = await prepareApplication(row, { coverLetter: true }, deps)
    expect(first).toEqual({ analyzed: true, tailored: true, coverLetter: true })
    expect(row.tailored_recommendations).toEqual([0, 1, 2])
    expect(row.tailored_comparison_id).toBe('cmp-1')
    expect(row.cover_letter).toBe('Dear Hiring Team')

    calls.length = 0
    const second = await prepareApplication(row, { coverLetter: true }, deps)
    expect(second).toEqual({ analyzed: false, tailored: false, coverLetter: false })
    expect(calls).toEqual([])
  })

  it('keeps the tailoring the user already chose', async () => {
    const row = {
      ...blank(),
      comparison_id: 'cmp-1',
      tailored_comparison_id: 'cmp-1',
      tailored_recommendations: [1],
    }
    const { deps, calls } = fakeDeps(row)

    const steps = await prepareApplication(row, { coverLetter: false }, deps)
    expect(steps).toEqual({ analyzed: false, tailored: false, coverLetter: false })
    expect(row.tailored_recommendations).toEqual([1])
    expect(calls).toEqual([])
  })

  it('needs a resume and stops at the AI budget', async () => {
    const noResume = fakeDeps(blank(), { findResumeId: async () => null })
    await expect(prepareApplication(blank(), { coverLetter: false }, noResume.deps)).rejects.toThrow(
      /Upload a resume/,
    )

    const limited = fakeDeps(blank(), { spendAi: () => false })
    await expect(
      prepareApplication(blank(), { coverLetter: false }, limited.deps),
    ).rejects.toBeInstanceOf(PrepareError)
    expect(limited.calls).toEqual([])
  })
})
