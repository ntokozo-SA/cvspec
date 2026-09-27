export const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api').replace(/\/$/, '')
export const WEB_URL = (import.meta.env.VITE_WEB_URL ?? 'http://localhost:5173').replace(/\/$/, '')
export const WEB_ORIGIN = new URL(WEB_URL).origin

export const SESSION_STORAGE_KEY = 'cvspec-session'
export const LAST_RESUME_KEY = 'cvspec-last-resume-id'
