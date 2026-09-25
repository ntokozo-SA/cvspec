import { useEffect, useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/Layout'
import { MatchGauge, SkillList } from '../components/MatchGauge'
import { getComparison, listComparisons } from '../lib/api'
import type { Comparison } from '../types'

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

      {error && <div className="form-error" style={{ marginBottom: '1rem' }}>{error}</div>}

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
  const [item, setItem] = useState<Comparison | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let alive = true
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
            <p className="panel-sub">Concrete changes for this posting, based on the gap list.</p>
          </div>
        </div>
        <div className="rec-list">
          {(item.recommendations ?? []).map((rec, index) => (
            <article key={`${rec.section}-${index}`} className="rec-item">
              <div className="rec-item__tag">{rec.section}</div>
              <h4>{rec.suggestion}</h4>
              <p>{rec.rationale}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
