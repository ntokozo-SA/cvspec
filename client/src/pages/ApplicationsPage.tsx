import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Button, EmptyState } from '../components/Layout'
import { deleteApplication, listApplications, updateApplication } from '../lib/api'
import { getExtensionStatus, subscribeExtensionStatus } from '../lib/extensionBridge'
import type { Application, ApplicationStatus, JobBoard } from '../types'

const STATUSES: Array<{ value: ApplicationStatus; label: string }> = [
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
]

const BOARD_LABELS: Record<JobBoard, string> = {
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
  glassdoor: 'Glassdoor',
  ziprecruiter: 'ZipRecruiter',
  google_jobs: 'Google for Jobs',
  careerbuilder: 'CareerBuilder',
  monster: 'Monster',
  simplyhired: 'SimplyHired',
  talention: 'Talention',
  flexjobs: 'FlexJobs',
  weworkremotely: 'We Work Remotely',
  remoteco: 'Remote.co',
  dice: 'Dice',
  wellfound: 'Wellfound',
  hired: 'Hired',
  builtin: 'Built In',
  handshake: 'Handshake',
  snagajob: 'Snagajob',
  upwork: 'Upwork',
  fiverr: 'Fiverr',
  idealist: 'Idealist',
  peoplecurated: 'People Curated',
  other: 'Other site',
}

const POLL_MS = 8000
const ANALYSIS_WINDOW_MS = 3 * 60 * 1000

function isAwaitingScore(item: Application): boolean {
  return !item.comparison_id && Date.now() - new Date(item.created_at).getTime() < ANALYSIS_WINDOW_MS
}

export function ApplicationsPage(): ReactElement {
  const [items, setItems] = useState<Application[]>([])
  const [tab, setTab] = useState<ApplicationStatus>('saved')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [extension, setExtension] = useState(getExtensionStatus)

  useEffect(() => subscribeExtensionStatus(setExtension), [])

  const refresh = useCallback(async () => {
    setItems(await listApplications())
  }, [])

  useEffect(() => {
    let alive = true
    refresh()
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load applications')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [refresh])

  const analyzing = items.some(isAwaitingScore)
  useEffect(() => {
    if (!analyzing) return
    const timer = setInterval(() => {
      void refresh().catch(() => undefined)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [analyzing, refresh])

  const counts = useMemo(() => {
    const result = Object.fromEntries(STATUSES.map((s) => [s.value, 0])) as Record<
      ApplicationStatus,
      number
    >
    items.forEach((item) => {
      result[item.status] += 1
    })
    return result
  }, [items])

  const visible = items.filter((item) => item.status === tab)

  const changeStatus = async (id: string, status: ApplicationStatus): Promise<void> => {
    setBusyId(id)
    setError(null)
    try {
      const updated = await updateApplication(id, { status })
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updated } : item)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string): Promise<void> => {
    setBusyId(id)
    setError(null)
    try {
      await deleteApplication(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Applications</h1>
          <p>
            Jobs saved from LinkedIn, Indeed, Glassdoor, ZipRecruiter and other job boards with the
            CVSpec Chrome extension.
          </p>
        </div>
        {extension.installed && (
          <span className={`ext-chip${extension.connected ? ' is-connected' : ''}`}>
            {extension.connected ? 'Extension connected' : 'Extension not connected'}
          </span>
        )}
      </div>

      {error && (
        <div className="form-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div className="tabs" role="tablist">
        {STATUSES.map((status) => (
          <button
            key={status.value}
            type="button"
            role="tab"
            className={`tab${tab === status.value ? ' is-active' : ''}`}
            aria-selected={tab === status.value}
            onClick={() => setTab(status.value)}
          >
            {status.label} ({counts[status.value]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-block">Loading applications...</div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No saved jobs yet"
          text={
            extension.installed
              ? 'Open a job on LinkedIn, Indeed, Glassdoor, ZipRecruiter or another supported board and click Save to CVSpec next to the Apply button.'
              : 'Install the CVSpec Chrome extension, then click Save to CVSpec on any job from LinkedIn, Indeed, Glassdoor, ZipRecruiter and other supported boards.'
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={`Nothing in ${STATUSES.find((s) => s.value === tab)?.label ?? tab}`}
          text="Move an application here by changing its status."
        />
      ) : (
        <div className="stack">
          {visible.map((item) => (
            <div key={item.id} className="list-row application-row">
              <div className="list-row__meta">
                <div className="list-row__title">
                  <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                    {item.title ?? item.job_spec?.parsed_json?.title ?? 'Untitled role'}
                  </a>
                </div>
                <div className="list-row__sub">
                  {[item.company, item.location, BOARD_LABELS[item.board]]
                    .filter(Boolean)
                    .join(' · ')}{' '}
                  · Saved {new Date(item.created_at).toLocaleDateString()}
                </div>
              </div>

              <div className="application-row__actions">
                {item.comparison ? (
                  <Link
                    className="application-row__score"
                    to={`/app/history/${item.comparison.id}`}
                    title="Open comparison"
                  >
                    {Math.round(Number(item.comparison.match_score))}%
                  </Link>
                ) : isAwaitingScore(item) ? (
                  <span className="application-row__pending">Analyzing...</span>
                ) : (
                  <Link className="application-row__pending" to="/app/compare">
                    Not scored
                  </Link>
                )}
                <select
                  className="select application-row__status"
                  aria-label="Application status"
                  value={item.status}
                  disabled={busyId === item.id}
                  onChange={(event) =>
                    void changeStatus(item.id, event.target.value as ApplicationStatus)
                  }
                >
                  {STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busyId === item.id}
                  onClick={() => void remove(item.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
