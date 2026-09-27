import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function BrandMark({ compact = false }: { compact?: boolean }): ReactElement {
  return (
    <Link to="/" className="brand" aria-label="CV Specs home">
      <span className="brand__mark" aria-hidden>
        CV
      </span>
      {!compact && <span className="brand__text">CV Specs</span>}
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
              <Link className="btn btn-ghost btn-sm nav-actions__login" to="/login">
                Log in
              </Link>
              <Link className="btn btn-primary btn-sm" to="/signup">
                <span className="nav-actions__signup-full">Create account</span>
                <span className="nav-actions__signup-short">Sign up</span>
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
    <header className="site-nav site-nav--app">
      <div className="site-nav__inner">
        <BrandMark />
        <div className="nav-actions">
          {demoMode && <span className="nav-chip">Demo</span>}
          {user?.email && (
            <span className="nav-email" title={user.email}>
              {user.email}
            </span>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}

const appNavItems = [
  { to: '/app', end: true, label: 'Overview', icon: 'overview' },
  { to: '/app/resumes', end: false, label: 'Resumes', icon: 'resumes' },
  { to: '/app/job-specs', end: false, label: 'Jobs', icon: 'jobs' },
  { to: '/app/compare', end: false, label: 'Compare', icon: 'compare' },
  { to: '/app/applications', end: false, label: 'Applied', icon: 'applications' },
  { to: '/app/history', end: false, label: 'History', icon: 'history' },
] as const

function NavIcon({ name }: { name: (typeof appNavItems)[number]['icon'] }): ReactElement {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (name) {
    case 'overview':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      )
    case 'resumes':
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v4h4" />
          <path d="M10 12h6M10 16h6" />
        </svg>
      )
    case 'jobs':
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="12" rx="2" />
          <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      )
    case 'compare':
      return (
        <svg {...common}>
          <path d="M8 5v14M16 5v14" />
          <path d="M4 9h8M12 15h8" />
        </svg>
      )
    case 'applications':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="5" height="16" rx="1.2" />
          <rect x="10" y="4" width="5" height="11" rx="1.2" />
          <rect x="17" y="4" width="4" height="7" rx="1.2" />
        </svg>
      )
    case 'history':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </svg>
      )
  }
}

export function AppSidebar(): ReactElement {
  const linkClass = ({ isActive }: { isActive: boolean }): string =>
    `side-link${isActive ? ' is-active' : ''}`

  return (
    <aside className="app-sidebar app-sidebar--desktop" aria-label="App sections">
      <nav>
        {appNavItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
            <span className="side-link__icon">
              <NavIcon name={item.icon} />
            </span>
            <span>
              {item.label === 'Jobs'
                ? 'Job specs'
                : item.label === 'Applied'
                  ? 'Applications'
                  : item.label}
            </span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

export function AppBottomNav(): ReactElement {
  const linkClass = ({ isActive }: { isActive: boolean }): string =>
    `bottom-nav__link${isActive ? ' is-active' : ''}`

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {appNavItems.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
          <span className="bottom-nav__icon">
            <NavIcon name={item.icon} />
          </span>
          <span className="bottom-nav__label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
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
