import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Button, EmptyState } from '../components/Layout'
import { clearApplyQueue, getApplyQueue, prepareApplication, setApplyQueue } from '../lib/api'
import {
  getExtensionStatus,
  startQueueInExtension,
  subscribeExtensionStatus,
} from '../lib/extensionBridge'
import type { Application } from '../types'

function jobTitle(item: Application): string {
  return item.title ?? item.job_spec?.parsed_json?.title ?? 'Untitled role'
}

function isPrepared(item: Application, coverLetter: boolean): boolean {
  return (
    Boolean(item.comparison_id) &&
    (item.tailored_recommendations?.length ?? 0) > 0 &&
    (!coverLetter || Boolean(item.cover_letter))
  )
}

function PrepareSummary({ item }: { item: Application }): ReactElement {
  const tailored = item.tailored_recommendations?.length ?? 0
  const parts = [
    item.comparison
      ? `Scored ${Math.round(Number(item.comparison.match_score))}%`
      : item.comparison_id
        ? 'Scored'
        : 'Not scored',
    tailored > 0 ? `${tailored} tailoring change${tailored === 1 ? '' : 's'}` : 'Not tailored',
    item.cover_letter ? 'Cover letter ready' : 'No cover letter',
  ]
  return <span className="list-row__sub">{parts.join(' · ')}</span>
}

export function ApplyQueuePage(): ReactElement {
  const [items, setItems] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [coverLetters, setCoverLetters] = useState(false)
  const [extension, setExtension] = useState(getExtensionStatus)

  useEffect(() => subscribeExtensionStatus(setExtension), [])

  const load = useCallback(async () => {
    setItems(await getApplyQueue())
  }, [])

  useEffect(() => {
    let alive = true
    load()
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load the apply queue')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [load])

  const run = async (key: string, task: () => Promise<void>): Promise<void> => {
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const save = (ids: string[]): Promise<void> =>
    run('order', async () => {
      setItems(await setApplyQueue(ids))
    })

  const move = (index: number, delta: number): void => {
    const ids = items.map((item) => item.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    void save(ids)
  }

  const remove = (id: string): void => {
    void save(items.filter((item) => item.id !== id).map((item) => item.id))
  }

  const clear = (): void => {
    void run('order', async () => {
      await clearApplyQueue()
      setItems([])
    })
  }

  const prepareOne = async (id: string): Promise<void> => {
    const { application } = await prepareApplication(id, { coverLetter: coverLetters })
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...application } : item)))
  }

  const prepare = (id: string): void => {
    void run(id, () => prepareOne(id))
  }

  const prepareAll = (): void => {
    void run('all', async () => {
      for (const item of items) {
        if (!isPrepared(item, coverLetters)) await prepareOne(item.id)
      }
      setNotice('Every job in the queue is prepared.')
    })
  }

  const start = (): void => {
    void run('start', async () => {
      await startQueueInExtension()
      setNotice('The apply queue opened in the CVSpec extension. Press Start there to begin.')
    })
  }

  const unprepared = items.filter((item) => !isPrepared(item, coverLetters)).length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Apply queue</h1>
          <p>
            Line up to 20 saved jobs. CVSpec opens each application form in turn and fills it from
            your profile. You review every form and click Submit yourself.
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
      {notice && (
        <div className="form-success" style={{ marginBottom: '1rem' }}>
          {notice}
        </div>
      )}

      {loading ? (
        <div className="loading-block">Loading the apply queue...</div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Your apply queue is empty"
          text="Tick saved jobs in the job tracker and choose Add to apply queue. Jobs that use the board's own form (LinkedIn Easy Apply, Indeed Apply) can't be queued; apply on the board yourself."
          action={
            <Link className="btn btn-primary" to="/app/applications">
              Open the job tracker
            </Link>
          }
        />
      ) : (
        <>
          <div className="queue-toolbar">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={coverLetters}
                onChange={(event) => setCoverLetters(event.target.checked)}
              />{' '}
              Also draft cover letters
            </label>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null || unprepared === 0}
              onClick={prepareAll}
            >
              {busy === 'all'
                ? 'Preparing...'
                : unprepared === 0
                  ? 'All prepared'
                  : `Prepare ${unprepared} job${unprepared === 1 ? '' : 's'}`}
            </Button>
            <Button
              size="sm"
              disabled={busy !== null || !extension.installed}
              title={extension.installed ? undefined : 'Install the CVSpec Chrome extension first'}
              onClick={start}
            >
              {busy === 'start' ? 'Opening...' : 'Start in extension'}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={clear}>
              Clear queue
            </Button>
          </div>

          <ol className="stack queue-list">
            {items.map((item, index) => (
              <li key={item.id} className="list-row application-row">
                <div className="list-row__meta">
                  <div className="list-row__title">
                    {index + 1}.{' '}
                    <Link to={`/app/applications/${item.id}`}>{jobTitle(item)}</Link>
                  </div>
                  <div className="list-row__sub">
                    {[item.company, item.location].filter(Boolean).join(' · ')}
                  </div>
                  <PrepareSummary item={item} />
                </div>
                <div className="application-row__actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy !== null || isPrepared(item, coverLetters)}
                    onClick={() => prepare(item.id)}
                  >
                    {busy === item.id
                      ? 'Preparing...'
                      : isPrepared(item, coverLetters)
                        ? 'Prepared'
                        : 'Prepare'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Move up"
                    disabled={busy !== null || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Move down"
                    disabled={busy !== null || index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => remove(item.id)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ol>

          <p className="muted" style={{ marginTop: '1rem' }}>
            Preparing scores each job against your resume, tailors it to every recommendation and,
            if ticked, drafts a cover letter. It uses your AI allowance, so you can skip it and
            prepare jobs one at a time. Sign-in pages, ID numbers and employment-equity questions
            are always left for you to complete.
          </p>
        </>
      )}
    </div>
  )
}
