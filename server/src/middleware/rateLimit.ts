import type { NextFunction, Request, Response } from 'express'
import { getAuth } from './auth.js'

export const AI_LIMIT_MESSAGE = 'Too many AI drafts in the last hour. Try again in a few minutes.'

/**
 * Per-user sliding-window budget for AI generation. In memory, which holds while the API runs as
 * a single task; move to a shared store before scaling out.
 */
export function aiBudget({ limit = 30, windowMs = 60 * 60 * 1000 } = {}) {
  const hits = new Map<string, number[]>()
  return {
    /** Spends one call. Returns null when allowed, else the seconds until one is free again. */
    take(userId: string): number | null {
      const now = Date.now()
      const recent = (hits.get(userId) ?? []).filter((at) => now - at < windowMs)
      if (recent.length >= limit) {
        hits.set(userId, recent)
        return Math.ceil((recent[0] + windowMs - now) / 1000)
      }
      recent.push(now)
      hits.set(userId, recent)
      return null
    },
  }
}

/** Middleware form of `aiBudget`: every request to the route spends one call. */
export function aiRateLimit(options: { limit?: number; windowMs?: number } = {}) {
  const budget = aiBudget(options)

  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = getAuth(req).user?.id
    if (!userId) {
      next()
      return
    }
    const retryAfter = budget.take(userId)
    if (retryAfter !== null) {
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({ error: AI_LIMIT_MESSAGE })
      return
    }
    next()
  }
}
