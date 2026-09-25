import type { NextFunction, Request, Response } from 'express'
import { createClient, type User } from '@supabase/supabase-js'

export interface AuthedRequest extends Request {
  user: User
  accessToken: string
}

function getSupabaseAnon() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required')
  }
  return createClient(url, key)
}

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }
  return createClient(url, key)
}

export function getAuth(req: Request): AuthedRequest {
  return req as unknown as AuthedRequest
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization token' })
      return
    }

    const token = header.slice('Bearer '.length)
    const supabase = getSupabaseAnon()
    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }

    const authed = getAuth(req)
    authed.user = data.user
    authed.accessToken = token
    next()
  } catch (err) {
    next(err)
  }
}
