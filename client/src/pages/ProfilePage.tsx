import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { Button } from '../components/Layout'
import { useOnline } from '../hooks/useOnline'
import { getProfile, updateProfile } from '../lib/api'
import type { ApplicantProfileInput } from '../types'

const EMPTY: ApplicantProfileInput = {
  firstName: null,
  lastName: null,
  email: null,
  phone: null,
  location: null,
  linkedinUrl: null,
  websiteUrl: null,
}

const FIELDS: Array<{
  key: keyof ApplicantProfileInput
  label: string
  type: 'text' | 'email' | 'tel' | 'url'
  autoComplete: string
  placeholder?: string
}> = [
  { key: 'firstName', label: 'First name', type: 'text', autoComplete: 'given-name' },
  { key: 'lastName', label: 'Last name', type: 'text', autoComplete: 'family-name' },
  { key: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  {
    key: 'phone',
    label: 'Phone',
    type: 'tel',
    autoComplete: 'tel',
    placeholder: '+27 82 123 4567',
  },
  {
    key: 'location',
    label: 'Location',
    type: 'text',
    autoComplete: 'address-level2',
    placeholder: 'Cape Town, South Africa',
  },
  {
    key: 'linkedinUrl',
    label: 'LinkedIn profile',
    type: 'url',
    autoComplete: 'url',
    placeholder: 'https://www.linkedin.com/in/your-name',
  },
  {
    key: 'websiteUrl',
    label: 'Website or portfolio',
    type: 'url',
    autoComplete: 'url',
    placeholder: 'https://',
  },
]

export function ProfilePage(): ReactElement {
  const online = useOnline()
  const [values, setValues] = useState<ApplicantProfileInput>(EMPTY)
  const [saved, setSaved] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getProfile()
      .then((profile) => {
        if (!alive) return
        const { updatedAt: _updatedAt, saved: isSaved, ...rest } = profile
        setValues(rest)
        setSaved(isSaved)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load your profile')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const profile = await updateProfile(values)
      const { updatedAt: _updatedAt, saved: isSaved, ...rest } = profile
      setValues(rest)
      setSaved(isSaved)
      setMessage('Profile saved. The extension will use these details to fill applications.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Application profile</h1>
          <p>
            The CVSpec extension fills these details into Greenhouse, Lever and other application
            forms, alongside your tailored resume. You always review and submit the form yourself.
          </p>
        </div>
      </div>

      {error && (
        <div className="form-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      {message && (
        <div className="form-success" style={{ marginBottom: '1rem' }}>
          {message}
        </div>
      )}
      {!loading && !saved && (
        <div className="form-success" style={{ marginBottom: '1rem' }}>
          We pre-filled what we could from your latest resume. Check the details and save them.
        </div>
      )}

      {loading ? (
        <div className="loading-block">Loading your profile...</div>
      ) : (
        <form className="panel panel-pad form-stack" onSubmit={(e) => void submit(e)}>
          {FIELDS.map((field) => (
            <div key={field.key} className="field">
              <label htmlFor={`profile-${field.key}`}>{field.label}</label>
              <input
                id={`profile-${field.key}`}
                className="input"
                type={field.type}
                autoComplete={field.autoComplete}
                placeholder={field.placeholder}
                disabled={!online || busy}
                value={values[field.key] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              />
            </div>
          ))}
          <Button type="submit" disabled={!online || busy}>
            {busy ? 'Saving...' : 'Save profile'}
          </Button>
        </form>
      )}
    </div>
  )
}
