import type { NextFunction, Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { aiRateLimit } from './rateLimit.js'

function call(limiter: ReturnType<typeof aiRateLimit>, userId: string) {
  const req = { user: { id: userId } } as unknown as Request
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value
    },
    status(code: number) {
      this.statusCode = code
      return this
    },
    json: vi.fn(),
  }
  const next = vi.fn() as unknown as NextFunction
  limiter(req, res as unknown as Response, next)
  return { res, next }
}

describe('aiRateLimit', () => {
  it('allows up to the limit per user, then answers 429', () => {
    const limiter = aiRateLimit({ limit: 2, windowMs: 60_000 })
    expect(call(limiter, 'a').next).toHaveBeenCalled()
    expect(call(limiter, 'a').next).toHaveBeenCalled()
    const blocked = call(limiter, 'a')
    expect(blocked.next).not.toHaveBeenCalled()
    expect(blocked.res.statusCode).toBe(429)
    expect(blocked.res.headers['Retry-After']).toBeDefined()
    expect(call(limiter, 'b').next).toHaveBeenCalled()
  })

  it('frees the slot once the window passes', () => {
    vi.useFakeTimers()
    const limiter = aiRateLimit({ limit: 1, windowMs: 1000 })
    expect(call(limiter, 'a').next).toHaveBeenCalled()
    expect(call(limiter, 'a').next).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1001)
    expect(call(limiter, 'a').next).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
