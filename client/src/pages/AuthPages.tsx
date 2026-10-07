import { useState, type FormEvent, type ReactElement } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { BrandMark, Button, SiteFooter } from '../components/Layout'
import { useAuth } from '../hooks/useAuth'

export function LoginPage(): ReactElement {
  const { signIn, continueAsDemo, user, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/app" replace />

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
      navigate('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="shell">
      <header className="site-nav">
        <div className="site-nav__inner">
          <BrandMark />
        </div>
      </header>
      <main className="auth-page">
        <div className="container-narrow panel auth-card">
          <h1 className="auth-card__title">Log in</h1>
          <p className="auth-card__sub">Access your resumes, job specs, and past comparisons.</p>
          <form className="form-stack" onSubmit={(e) => void onSubmit(e)}>
            {error && <div className="form-error">{error}</div>}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button variant="primary" block disabled={submitting} type="submit">
              {submitting ? 'Signing in...' : 'Log in'}
            </Button>
          </form>
          <Button
            variant="secondary"
            block
            className="mt"
            style={{ marginTop: '0.75rem' }}
            onClick={() => {
              continueAsDemo()
              navigate('/app')
            }}
          >
            Continue in demo mode
          </Button>
          <p className="auth-switch">
            Need an account? <Link to="/signup">Create one</Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

export function SignupPage(): ReactElement {
  const { signUp, continueAsDemo, user, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/app" replace />

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setSubmitting(true)
    try {
      await signUp(email.trim(), password)
      setMessage('Account created. If email confirmation is enabled, check your inbox.')
      navigate('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="shell">
      <header className="site-nav">
        <div className="site-nav__inner">
          <BrandMark />
        </div>
      </header>
      <main className="auth-page">
        <div className="container-narrow panel auth-card">
          <h1 className="auth-card__title">Create account</h1>
          <p className="auth-card__sub">
            Save resumes and job specs so you can rerun comparisons later.
          </p>
          <form className="form-stack" onSubmit={(e) => void onSubmit(e)}>
            {error && <div className="form-error">{error}</div>}
            {message && <div className="form-success">{message}</div>}
            <div className="field">
              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                className="input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                className="input"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span className="field-hint">At least 6 characters.</span>
            </div>
            <Button variant="primary" block disabled={submitting} type="submit">
              {submitting ? 'Creating...' : 'Create account'}
            </Button>
          </form>
          <Button
            variant="secondary"
            block
            style={{ marginTop: '0.75rem' }}
            onClick={() => {
              continueAsDemo()
              navigate('/app')
            }}
          >
            Continue in demo mode
          </Button>
          <p className="auth-switch">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
