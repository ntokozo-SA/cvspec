import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function BrandMark(): ReactElement {
  return (
    <Link to="/" className="brand" aria-label="CV Specs home">
      <span className="brand__mark" aria-hidden>
        CV
      </span>
      <span>CV Specs</span>
    </Link>
  )
}

export function PublicNav(): ReactElement {
  const { user } = useAuth()

  return (
    <header className="site-nav">
      <div className="site-nav__inner">
        <BrandMark />
        <div className="nav-links">
          <a className="nav-link" href="#how-it-works">
            How it works
          </a>
        </div>
        <div className="nav-actions">
          {user ? (
            <Link className="btn btn-primary btn-sm" to="/app">
              Open app
            </Link>
          ) : (
            <>
              <Link className="btn btn-ghost btn-sm" to="/login">
                Log in
              </Link>
              <Link className="btn btn-primary btn-sm" to="/signup">
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export function AppNav(): ReactElement {
  const { user, signOut, demoMode } = useAuth()

  return (
    <header className="site-nav">
      <div className="site-nav__inner">
        <BrandMark />
        <div className="nav-actions">
          {demoMode && <span className="field-hint">Demo mode</span>}
          <span className="field-hint">{user?.email}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}

export function AppSidebar(): ReactElement {
  const linkClass = ({ isActive }: { isActive: boolean }): string =>
    `side-link${isActive ? ' is-active' : ''}`

  return (
    <aside className="app-sidebar">
      <nav>
        <NavLink to="/app" end className={linkClass}>
          Overview
        </NavLink>
        <NavLink to="/app/resumes" className={linkClass}>
          Resumes
        </NavLink>
        <NavLink to="/app/job-specs" className={linkClass}>
          Job specs
        </NavLink>
        <NavLink to="/app/compare" className={linkClass}>
          Compare
        </NavLink>
        <NavLink to="/app/history" className={linkClass}>
          History
        </NavLink>
      </nav>
    </aside>
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'signal'
  block?: boolean
  size?: 'sm' | 'md'
}

export function Button({
  variant = 'primary',
  block,
  size = 'md',
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps): ReactElement {
  const classes = [
    'btn',
    `btn-${variant}`,
    block ? 'btn-block' : '',
    size === 'sm' ? 'btn-sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  )
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string
  text: string
  action?: ReactNode
}): ReactElement {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}

export function OfflineBanner({ online }: { online: boolean }): ReactElement | null {
  if (online) return null
  return (
    <div className="offline-banner" role="status">
      You are offline. Past comparisons stay available. New uploads and comparisons are disabled
      until you reconnect.
    </div>
  )
}
