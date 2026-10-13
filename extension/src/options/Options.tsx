import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { WEB_URL } from '../shared/config'
import { requestSite, removeSite, siteAccess, watchSiteAccess } from '../shared/siteAccess'
import { SITE_IDS, SITES, type SiteId, type SiteKind } from '../shared/sites'

const GROUPS: Array<{ kind: SiteKind; title: string; hint: string }> = [
  {
    kind: 'apply',
    title: 'Application forms',
    hint: 'CVSpec fills your contact details, tailored resume, cover letter and reviewed answers. You always click Next and Submit yourself, and CVSpec never signs in for you.',
  },
  {
    kind: 'board',
    title: 'Job boards',
    hint: 'CVSpec adds Save and Tailor buttons to job posts so you can track them.',
  },
]

export function Options(): ReactElement {
  const [access, setAccess] = useState<Record<SiteId, boolean> | null>(null)
  const [busy, setBusy] = useState<SiteId | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setAccess(await siteAccess())
  }, [])

  useEffect(() => {
    void refresh()
    return watchSiteAccess(() => void refresh())
  }, [refresh])

  const toggle = async (id: SiteId, enable: boolean) => {
    setBusy(id)
    setError(null)
    try {
      const changed = enable ? await requestSite(id) : await removeSite(id)
      if (!changed && enable) setError(`Access to ${SITES[id].label} was not granted.`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change site access')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="options">
      <header className="options__head">
        <span className="brand-mark" aria-hidden>
          CV
        </span>
        <div>
          <h1>CVSpec sites</h1>
          <p className="muted">
            CVSpec only runs on these sites after you switch them on here. Chrome asks you to
            confirm each one, and you can switch any of them off at any time.
          </p>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {GROUPS.map((group) => (
        <section key={group.kind} className="card">
          <h2>{group.title}</h2>
          <p className="muted">{group.hint}</p>
          <ul className="sites">
            {SITE_IDS.filter((id) => SITES[id].kind === group.kind).map((id) => {
              const enabled = access?.[id] ?? false
              return (
                <li key={id} className="site">
                  <div className="site__meta">
                    <strong>{SITES[id].label}</strong>
                    <span className="muted">{SITES[id].description}</span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={enabled}
                      disabled={access === null || busy !== null}
                      aria-label={`Run CVSpec on ${SITES[id].label}`}
                      onChange={(event) => void toggle(id, event.target.checked)}
                    />
                    <span>{busy === id ? 'Waiting...' : enabled ? 'On' : 'Off'}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <p className="muted">
        CVSpec never submits an application, never signs in for you and never stores passwords.
        Read the{' '}
        <a href={`${WEB_URL}/privacy`} target="_blank" rel="noopener noreferrer">
          privacy policy
        </a>
        .
      </p>
    </main>
  )
}
