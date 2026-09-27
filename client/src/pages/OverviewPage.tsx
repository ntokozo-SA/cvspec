import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/Layout'
import { listComparisons, listJobSpecs, listResumes } from '../lib/api'
import type { Comparison, JobSpec, Resume } from '../types'

export function OverviewPage(): ReactElement {
  const [resumes, setResumes] = useState<Resume[]>([])
  const [jobs, setJobs] = useState<JobSpec[]>([])
  const [comparisons, setComparisons] = useState<Comparison[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([listResumes(), listJobSpecs(), listComparisons()])
      .then(([r, j, c]) => {
        if (!alive) return
        setResumes(r)
        setJobs(j)
        setComparisons(c)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  if (loading) return <div className="loading-block">Loading workspace...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Overview</h1>
          <p>Upload a resume, add a job spec, then run a comparison.</p>
        </div>
        <Link className="btn btn-primary" to="/app/compare">
          Run comparison
        </Link>
      </div>

      <div className="grid-2" style={{ marginBottom: '1rem' }}>
        <div className="panel panel-pad">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Resumes</h2>
              <p className="panel-sub">{resumes.length} stored</p>
            </div>
            <Link className="btn btn-secondary btn-sm" to="/app/resumes">
              Manage
            </Link>
          </div>
          {resumes[0] ? (
            <p>
              Latest: <strong>{resumes[0].file_name}</strong>
            </p>
          ) : (
            <p className="field-hint">No resumes yet.</p>
          )}
        </div>
        <div className="panel panel-pad">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Job specs</h2>
              <p className="panel-sub">{jobs.length} stored</p>
            </div>
            <Link className="btn btn-secondary btn-sm" to="/app/job-specs">
              Manage
            </Link>
          </div>
          {jobs[0] ? (
            <p>
              Latest:{' '}
              <strong>{jobs[0].parsed_json?.title ?? jobs[0].title ?? jobs[0].source_type}</strong>
            </p>
          ) : (
            <p className="field-hint">No job specs yet.</p>
          )}
        </div>
      </div>

      <div className="panel panel-pad">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Recent comparisons</h2>
            <p className="panel-sub">Open a past result to review gaps and edits.</p>
          </div>
          <Link className="btn btn-secondary btn-sm" to="/app/history">
            View all
          </Link>
        </div>
        {comparisons.length === 0 ? (
          <EmptyState
            title="No comparisons yet"
            text="Add a resume and a job spec, then run your first match."
            action={
              <Link className="btn btn-primary" to="/app/compare">
                Compare now
              </Link>
            }
          />
        ) : (
          <div className="stack">
            {comparisons.slice(0, 5).map((item) => (
              <Link key={item.id} className="list-row" to={`/app/history/${item.id}`}>
                <div className="list-row__meta">
                  <div className="list-row__title">
                    {item.job_spec?.parsed_json?.title ?? 'Job comparison'}
                  </div>
                  <div className="list-row__sub">
                    {new Date(item.created_at).toLocaleString()} · {item.resume?.file_name}
                  </div>
                </div>
                <strong>{Math.round(item.match_score)}%</strong>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
