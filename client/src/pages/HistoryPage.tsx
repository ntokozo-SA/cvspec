import { useEffect, useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, EmptyState } from '../components/Layout'
import { MatchGauge, SkillList } from '../components/MatchGauge'
import { useOnline } from '../hooks/useOnline'
import { generateTailoredResume, getComparison, listComparisons } from '../lib/api'
import type { Comparison } from '../types'

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function HistoryPage(): ReactElement {
  const [items, setItems] = useState<Comparison[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listComparisons()
      .then((data) => {
        if (alive) setItems(data)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load history')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>History</h1>
          <p>Previously computed comparisons stay available offline once cached.</p>
        </div>
        <Link className="btn btn-primary" to="/app/compare">
          New comparison
        </Link>
      </div>

      {error && (
        <div className="form-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-block">Loading history...</div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No saved comparisons"
          text="Run a comparison to see match scores and recommendations here."
          action={
            <Link className="btn btn-primary" to="/app/compare">
              Compare now
            </Link>
          }
        />
      ) : (
        <div className="stack">
          {items.map((item) => (
            <Link key={item.id} className="list-row" to={`/app/history/${item.id}`}>
              <div className="list-row__meta">
                <div className="list-row__title">
                  {item.job_spec?.parsed_json?.title ?? 'Comparison'}
                </div>
                <div className="list-row__sub">
                  {item.resume?.file_name ?? 'Resume'} ·{' '}
                  {new Date(item.created_at).toLocaleString()}
                </div>
              </div>
              <strong>{Math.round(Number(item.match_score))}%</strong>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function ComparisonDetailPage(): ReactElement {
  const { id } = useParams()
  const online = useOnline()
  const [item, setItem] = useState<Comparison | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [tailorError, setTailorError] = useState<string | null>(null)
  const [tailorNotice, setTailorNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let alive = true
    setSelected(new Set())
    setTailorError(null)
    setTailorNotice(null)
    getComparison(id)
      .then((data) => {
        if (alive) setItem(data)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load comparison')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id])

  if (loading) return <div className="loading-block">Loading comparison...</div>
  if (error || !item) {
    return (
      <EmptyState
        title="Comparison unavailable"
        text={error ?? 'This comparison could not be found.'}
        action={
          <Link className="btn btn-secondary" to="/app/history">
            Back to history
          </Link>
        }
      />
    )
  }

  const recommendations = item.recommendations ?? []
  const resumeName = item.resume?.file_name ?? ''
  const canTailor = /\.docx$/i.test(resumeName)
  const allSelected = recommendations.length > 0 && selected.size === recommendations.length

  const toggle = (index: number): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const toggleAll = (): void => {
    setSelected(allSelected ? new Set() : new Set(recommendations.map((_, index) => index)))
  }

  const downloadTailored = async (): Promise<void> => {
    const picked = [...selected].sort((a, b) => a - b)
    setGenerating(true)
    setTailorError(null)
    setTailorNotice(null)
    try {
      const result = await generateTailoredResume(item.id, picked)
      saveBlob(result.blob, result.fileName)
      const applied = picked.length - result.unapplied.length
      setTailorNotice(
        result.unapplied.length === 0
          ? `Downloaded ${result.fileName} with ${applied} ${applied === 1 ? 'edit' : 'edits'} applied.`
          : `Downloaded ${result.fileName} with ${applied} of ${picked.length} edits applied. These could not be placed automatically, so add them by hand: ${result.unapplied
              .map((index) => `"${recommendations[index]?.suggestion}"`)
              .join('; ')}`,
      )
    } catch (err) {
      setTailorError(err instanceof Error ? err.message : 'Could not generate the tailored resume')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{item.job_spec?.parsed_json?.title ?? 'Comparison result'}</h1>
          <p>
            {item.resume?.file_name ?? 'Resume'} · {new Date(item.created_at).toLocaleString()}
          </p>
        </div>
        <Link className="btn btn-secondary" to="/app/history">
          Back
        </Link>
      </div>

      <div className="panel match-hero">
        <MatchGauge score={Number(item.match_score)} />
        <div>
          <div className="score-card__label">Compatibility match</div>
          <h2 style={{ fontSize: '1.5rem', margin: '0.35rem 0 0.5rem' }}>
            {Math.round(Number(item.match_score))}% against required skills
          </h2>
          <p className="field-hint">
            Score = matched required skills / total required skills. Preferred skills do not change
            the percentage.
          </p>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: '1rem' }}>
        <div className="panel panel-pad">
          <h3 className="panel-title" style={{ marginBottom: '0.75rem' }}>
            Matched skills
          </h3>
          <SkillList skills={item.matched_skills ?? []} variant="matched" />
        </div>
        <div className="panel panel-pad">
          <h3 className="panel-title" style={{ marginBottom: '0.75rem' }}>
            Missing skills
          </h3>
          <SkillList skills={item.missing_skills ?? []} variant="missing" />
        </div>
      </div>

      <div className="panel panel-pad">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Edit recommendations</h2>
            <p className="panel-sub">
              {canTailor
                ? `Choose the edits you want, then download ${resumeName} with them applied. The tailored copy is generated on demand and never stored.`
                : 'Concrete changes for this posting, based on the gap list.'}
            </p>
          </div>
          {canTailor && recommendations.length > 0 && (
            <Button variant="ghost" size="sm" onClick={toggleAll} disabled={generating}>
              {allSelected ? 'Clear' : 'Select all'}
            </Button>
          )}
        </div>

        {!canTailor && recommendations.length > 0 && resumeName && (
          <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
            Edits can only be applied automatically to DOCX resumes. Upload this resume as a DOCX or
            a text-based PDF to download a tailored copy.
          </p>
        )}

        <div className="rec-list">
          {recommendations.map((rec, index) => {
            const content = (
              <>
                <div className="rec-item__tag">{rec.section}</div>
                {rec.original && (
                  <p className="rec-item__original">
                    <span>Current:</span> {rec.original}
                  </p>
                )}
                <h4>{rec.suggestion}</h4>
                <p>{rec.rationale}</p>
              </>
            )
            if (!canTailor) {
              return (
                <article key={`${rec.section}-${index}`} className="rec-item">
                  {content}
                </article>
              )
            }
            return (
              <label
                key={`${rec.section}-${index}`}
                className={`rec-item rec-item--selectable${selected.has(index) ? ' is-selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(index)}
                  onChange={() => toggle(index)}
                  disabled={generating}
                />
                <div>{content}</div>
              </label>
            )
          })}
        </div>

        {canTailor && recommendations.length > 0 && (
          <div className="rec-actions">
            {tailorError && <div className="form-error">{tailorError}</div>}
            {tailorNotice && <div className="form-success">{tailorNotice}</div>}
            <Button
              onClick={() => void downloadTailored()}
              disabled={!online || generating || selected.size === 0}
            >
              {generating
                ? 'Generating tailored resume...'
                : `Download tailored resume${selected.size > 0 ? ` (${selected.size} ${selected.size === 1 ? 'edit' : 'edits'})` : ''}`}
            </Button>
            {!online && (
              <p className="field-hint">Generating a tailored resume is disabled while offline.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
