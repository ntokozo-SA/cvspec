import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { ZodError } from 'zod'
import { resumesRouter } from './routes/resumes.js'
import { jobSpecsRouter } from './routes/jobSpecs.js'
import { comparisonsRouter } from './routes/comparisons.js'
import { applicationsRouter } from './routes/applications.js'
import { extensionRouter } from './routes/extension.js'
import { requireAuth } from './middleware/auth.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)

app.use(
  cors({
    origin: true,
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'X-Unapplied-Recommendations'],
  }),
)
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/resumes', requireAuth, resumesRouter)
app.use('/api/job-specs', requireAuth, jobSpecsRouter)
app.use('/api/comparisons', requireAuth, comparisonsRouter)
app.use('/api/applications', requireAuth, applicationsRouter)
app.use('/api/extension', requireAuth, extensionRouter)

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' })
      return
    }
    const message = err instanceof Error ? err.message : 'Unexpected server error'
    console.error('[api]', message)
    res.status(500).json({ error: message })
  },
)

app.listen(port, () => {
  console.log(`CV Spec API listening on http://localhost:${port}`)
})
