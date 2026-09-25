import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { resumesRouter } from './routes/resumes.js'
import { jobSpecsRouter } from './routes/jobSpecs.js'
import { comparisonsRouter } from './routes/comparisons.js'
import { requireAuth } from './middleware/auth.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/resumes', requireAuth, resumesRouter)
app.use('/api/job-specs', requireAuth, jobSpecsRouter)
app.use('/api/comparisons', requireAuth, comparisonsRouter)

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const message = err instanceof Error ? err.message : 'Unexpected server error'
    console.error('[api]', message)
    res.status(500).json({ error: message })
  },
)

app.listen(port, () => {
  console.log(`CV Specs API listening on http://localhost:${port}`)
})
