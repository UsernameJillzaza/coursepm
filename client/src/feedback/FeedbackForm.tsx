import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../api'

export default function FeedbackForm({ submissionId, revision, onSaved }: {
  submissionId: number
  revision: number
  onSaved: () => void
}) {
  const [body, setBody] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setFieldError('')
    setError('')
    try {
      await api(`/submissions/${submissionId}/feedback`, { method: 'POST', body: { body } })
      onSaved()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldError(caught.fields.body ?? '')
        if (!caught.fields.body) setError(caught.message)
      } else {
        setError('Could not reach the server.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-3">
      <label htmlFor={`feedback-body-${submissionId}`} className="form-label">Feedback for revision {revision}</label>
      <textarea
        id={`feedback-body-${submissionId}`}
        className={`form-control ${fieldError ? 'is-invalid' : ''}`}
        rows={3}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      {fieldError && <div className="invalid-feedback">{fieldError}</div>}
      {error && <div className="alert alert-danger mt-2" role="alert">{error}</div>}
      <button type="submit" className="btn btn-primary btn-sm mt-2" disabled={saving}>
        {saving ? 'Saving…' : 'Save feedback'}
      </button>
    </form>
  )
}
