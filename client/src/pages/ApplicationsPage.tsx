import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, EmptyState } from '../components/Layout'
import {
  MAX_QUEUE,
  deleteApplication,
  getApplyQueue,
  listApplications,
  setApplyQueue,
  updateApplication,
} from '../lib/api'
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
  pnet: 'PNet',
  careers24: 'Careers24',
  careerjunction: 'CareerJunction',
  offerzen: 'OfferZen',
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
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [queueing, setQueueing] = useState(false)
  const navigate = useNavigate()

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
  const queueable = (item: Application): boolean =>
    item.status === 'saved' && !item.built_in_apply && item.queue_position == null

  const toggleSelected = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const addToQueue = async (): Promise<void> => {
    setQueueing(true)
    setError(null)
    try {
      const current = (await getApplyQueue()).map((item) => item.id)
      const additions = items
        .filter((item) => selected.has(item.id) && queueable(item))
        .map((item) => item.id)
        .filter((id) => !current.includes(id))
      const ids = [...current, ...additions]
      if (ids.length > MAX_QUEUE) {
        throw new Error(
          `The apply queue holds up to ${MAX_QUEUE} jobs. It has ${current.length}; pick ${Math.max(0, MAX_QUEUE - current.length)} or fewer.`,
        )
      }
      await setApplyQueue(ids)
      setSelected(new Set())
      navigate('/app/queue')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add jobs to the apply queue')
    } finally {
      setQueueing(false)
    }
  }

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
          {tab === 'saved' && (
            <div className="queue-toolbar">
              <span className="muted" style={{ marginRight: 'auto' }}>
                Tick jobs to fill one after another with the apply queue.
              </span>
              <Button
                size="sm"
                disabled={queueing || selected.size === 0}
                onClick={() => void addToQueue()}
              >
                {queueing
                  ? 'Adding...'
                  : `Add to apply queue${selected.size > 0 ? ` (${selected.size})` : ''}`}
              </Button>
              <Link className="btn btn-ghost btn-sm" to="/app/queue">
                View queue
              </Link>
            </div>
          )}
          {visible.map((item) => (
            <div key={item.id} className="list-row application-row">
              {tab === 'saved' && (
                <input
                  type="checkbox"
                  className="application-row__select"
                  aria-label={`Add ${item.title ?? 'job'} to the apply queue`}
                  title={
                    item.built_in_apply
                      ? "Uses the board's own application form; apply on the board yourself"
                      : item.queue_position != null
                        ? `Already in the apply queue (#${item.queue_position})`
                        : undefined
                  }
                  disabled={!queueable(item)}
                  checked={selected.has(item.id) || item.queue_position != null}
                  onChange={() => toggleSelected(item.id)}
                />
              )}
              <div className="list-row__meta">
                <div className="list-row__title">
                  <Link to={`/app/applications/${item.id}`}>
                    {item.title ?? item.job_spec?.parsed_json?.title ?? 'Untitled role'}
                  </Link>
                </div>
                <div className="list-row__sub">
                  {[item.company, item.location, BOARD_LABELS[item.board]]
                    .filter(Boolean)
                    .join(' · ')}{' '}
                  · Saved {new Date(item.created_at).toLocaleDateString()} ·{' '}
                  <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                    Posting
                  </a>
                  {item.built_in_apply && " · Board's own form, apply there yourself"}
                  {item.queue_position != null && ` · In apply queue (#${item.queue_position})`}
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
