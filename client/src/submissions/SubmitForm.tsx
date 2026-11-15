import { useState, type FormEvent } from 'react'
import { api, ApiError, type FieldErrors } from '../api'
import { ErrorAlert } from '../components/States'
import type { Milestone } from '../milestones/types'

// F-05 submit form (FR-06, FR-07). Shown to students only, and only while the
// milestone is open and below its revision limit (AC-05-8). The server
// re-checks both rules: a 409 (the state changed while the page was open) is
// shown as an alert.
export default function SubmitForm({ milestone, onSubmitted }: { milestone: Milestone; onSubmitted: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [link, setLink] = useState('')
  const [fields, setFields] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (milestone.status === 'CLOSED') {
    return <p className="alert alert-secondary">The deadline has passed. Submissions are closed.</p>
  }
  if (milestone.revisionsUsed >= milestone.maxRevisions) {
    return <p className="alert alert-secondary">{`All ${milestone.maxRevisions} revisions used.`}</p>
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFields({})
    setError(null)
    try {
      await api(`/milestones/${milestone.id}/submissions`, { method: 'POST', body: { title, description, link } })
      setTitle('')
      setDescription('')
      setLink('')
      onSubmitted()
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields)
      else setError(err instanceof ApiError ? err.message : 'Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  const invalid = (name: string) => (fields[name] ? ' is-invalid' : '')
  const feedback = (name: string) => fields[name] && <div className="invalid-feedback">{fields[name]}</div>
  const next = milestone.revisionsUsed + 1

  return (
    <form onSubmit={onSubmit} noValidate className="card card-body mb-4">
      <h2 className="h6">{next === 1 ? 'Submit your work' : `Resubmit (revision ${next} of ${milestone.maxRevisions})`}</h2>
      {error && <ErrorAlert message={error} />}
      <div className="mb-2">
        <label htmlFor="s-title" className="form-label">Title</label>
        <input id="s-title" className={`form-control${invalid('title')}`} value={title} onChange={(e) => setTitle(e.target.value)} />
        {feedback('title')}
      </div>
      <div className="mb-2">
        <label htmlFor="s-description" className="form-label">Description</label>
        <textarea
          id="s-description"
          rows={3}
          className={`form-control${invalid('description')}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {feedback('description')}
      </div>
      <div className="mb-3">
        <label htmlFor="s-link" className="form-label">Link to the work (http/https)</label>
        <input
          id="s-link"
          type="url"
          className={`form-control${invalid('link')}`}
          placeholder="https://github.com/…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        {feedback('link')}
      </div>
      <div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Submitting…' : 'Submit work'}
        </button>
      </div>
    </form>
  )
}
