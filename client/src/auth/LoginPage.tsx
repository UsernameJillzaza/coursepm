import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, type FieldErrors } from '../api'
import HealthStatus from '../components/HealthStatus'
import { useAuth } from './AuthContext'

// F-01 UI contract (AC-01-10): e-mail + password, the button is disabled
// while sending. Missing fields show a message beside that field (from the
// server's 400 `fields`); invalid credentials show one generic alert that
// does not say which field was wrong. Typed values are always kept.
export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fields, setFields] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  if (user) return <Navigate to="/teams" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setFields({})
    setSending(true)
    try {
      await login(email, password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : '/teams', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields)
      else setError(err instanceof ApiError ? err.message : 'Could not reach the server. Try again.')
    } finally {
      setSending(false)
    }
  }

  const invalid = (name: string) => (fields[name] ? ' is-invalid' : '')
  const feedback = (name: string) => fields[name] && <div className="invalid-feedback">{fields[name]}</div>

  return (
    <main className="container py-5" style={{ maxWidth: 420 }}>
      <h1 className="h3 mb-1">Log in</h1>
      <p className="text-body-secondary mb-4">CoursePM: course project milestones and feedback</p>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={onSubmit} noValidate>
        <div className="mb-3">
          <label htmlFor="email" className="form-label">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            className={`form-control${invalid('email')}`}
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {feedback('email')}
        </div>
        <div className="mb-3">
          <label htmlFor="password" className="form-label">
            Password
          </label>
          <input
            id="password"
            type="password"
            className={`form-control${invalid('password')}`}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {feedback('password')}
        </div>
        <button type="submit" className="btn btn-primary w-100" disabled={sending}>
          {sending ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <footer className="mt-4 text-center">
        <HealthStatus />
      </footer>
    </main>
  )
}
