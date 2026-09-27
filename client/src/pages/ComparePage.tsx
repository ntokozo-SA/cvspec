import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, EmptyState } from '../components/Layout'
import { createComparison, listJobSpecs, listResumes } from '../lib/api'
import { useOnline } from '../hooks/useOnline'
import type { JobSpec, Resume } from '../types'

export function ComparePage(): ReactElement {
  const online = useOnline()
  const navigate = useNavigate()
  const [resumes, setResumes] = useState<Resume[]>([])
  const [jobs, setJobs] = useState<JobSpec[]>([])
  const [resumeId, setResumeId] = useState('')
  const [jobSpecId, setJobSpecId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([listResumes(), listJobSpecs()])
      .then(([r, j]) => {
        if (!alive) return
        setResumes(r)
        setJobs(j)
        if (r[0]) setResumeId(r[0].id)
        if (j[0]) setJobSpecId(j[0].id)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load inputs')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await createComparison(resumeId, jobSpecId)
      navigate(`/app/history/${result.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="loading-block">Loading comparison inputs...</div>

  if (resumes.length === 0 || jobs.length === 0) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1>Compare</h1>
            <p>Pick one resume and one job spec to score.</p>
          </div>
        </div>
        <EmptyState
          title="Missing inputs"
          text={
            resumes.length === 0
              ? 'Upload a resume first, then add a job spec.'
              : 'Add a job spec before running a comparison.'
          }
          action={
            <Link
              className="btn btn-primary"
              to={resumes.length === 0 ? '/app/resumes' : '/app/job-specs'}
            >
              {resumes.length === 0 ? 'Upload resume' : 'Add job spec'}
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Compare</h1>
          <p>
            Scoring is deterministic against required skills. Recommendations are generated from the
            gap list.
          </p>
        </div>
      </div>

      <form className="panel panel-pad form-stack" onSubmit={(e) => void onSubmit(e)}>
        {error && <div className="form-error">{error}</div>}
        <div className="field">
          <label htmlFor="resume">Resume</label>
          <select
            id="resume"
            className="select"
            value={resumeId}
            onChange={(e) => setResumeId(e.target.value)}
            disabled={busy}
          >
            {resumes.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.file_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="job">Job spec</label>
          <select
            id="job"
            className="select"
            value={jobSpecId}
            onChange={(e) => setJobSpecId(e.target.value)}
            disabled={busy}
          >
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.parsed_json?.title ?? job.title ?? job.source_type}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={!online || busy || !resumeId || !jobSpecId}>
          {busy ? 'Scoring and drafting edits...' : 'Run comparison'}
        </Button>
        {!online && <p className="field-hint">Comparisons are disabled while offline.</p>}
      </form>
    </div>
  )
}
