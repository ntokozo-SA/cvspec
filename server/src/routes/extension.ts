import { Router } from 'express'
import { getAuth, getSupabaseAdmin } from '../middleware/auth.js'

export const extensionRouter = Router()

/**
 * Mints a one-time magic link token for the signed-in user so the Chrome extension can
 * create its own Supabase session with verifyOtp. The extension must not reuse the web
 * app's refresh token: Supabase rotates refresh tokens and revokes the session on reuse.
 */
extensionRouter.post('/handoff', async (req, res, next) => {
  try {
    const { user } = getAuth(req)
    if (!user.email) {
      res.status(400).json({ error: 'Account has no email address' })
      return
    }

    const { data, error } = await getSupabaseAdmin().auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    })
    if (error) throw error

    const tokenHash = data.properties?.hashed_token
    if (!tokenHash) throw new Error('Supabase did not return a handoff token')

    res.setHeader('Cache-Control', 'no-store')
    res.json({ tokenHash, email: user.email })
  } catch (err) {
    next(err)
  }
})
