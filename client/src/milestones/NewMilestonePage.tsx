import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type FieldErrors } from '../api'
import { useAuth } from '../auth/AuthContext'

function bangkokInputToUtc(local: string) {
  const value = new Date(`${local}:00+07:00`)
  return Number.isFinite(value.getTime()) ? value.toISOString() : local
}

export default function NewMilestonePage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [maxRevisions, setMaxRevisions] = useState('3')
  const [fields, setFields] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (user?.role !== 'SUPERVISOR') {
    return <main className="container"><h1 className="h4">New milestone</h1><p>Only supervisors can create milestones.</p><Link to={`/teams/${teamId}`}>Back to team</Link></main>
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setFields({})
    setError('')
    try {
      await api(`/teams/${teamId}/milestones`, {
        method: 'POST',
        body: { title, description, deadline: bangkokInputToUtc(deadline), maxRevisions: Number(maxRevisions) },
      })
      navigate(`/teams/${teamId}`)
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFields(caught.fields)
        setError(caught.message)
      } else {
        setError('Could not reach the server.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="container" style={{ maxWidth: 720 }}>
      <Link to={`/teams/${teamId}`} className="d-inline-block mb-3">Back to team</Link>
      <h1 className="h4 mb-3">New milestone</h1>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <form onSubmit={onSubmit} noValidate>
        <div className="mb-3">
          <label htmlFor="milestone-title" className="form-label">Title</label>
          <input id="milestone-title" className={`form-control ${fields.title ? 'is-invalid' : ''}`} value={title} onChange={(e) => setTitle(e.target.value)} />
          {fields.title && <div className="invalid-feedback">{fields.title}</div>}
        </div>
        <div className="mb-3">
          <label htmlFor="milestone-description" className="form-label">Description</label>
          <textarea id="milestone-description" className={`form-control ${fields.description ? 'is-invalid' : ''}`} value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          {fields.description && <div className="invalid-feedback">{fields.description}</div>}
        </div>
        <div className="mb-3">
          <label htmlFor="milestone-deadline" className="form-label">Deadline (Bangkok time)</label>
          <input id="milestone-deadline" type="datetime-local" className={`form-control ${fields.deadline ? 'is-invalid' : ''}`} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          {fields.deadline && <div className="invalid-feedback">{fields.deadline}</div>}
        </div>
        <div className="mb-3">
          <label htmlFor="milestone-max-revisions" className="form-label">Revision limit</label>
          <input id="milestone-max-revisions" type="number" min="1" max="5" step="1" className={`form-control ${fields.maxRevisions ? 'is-invalid' : ''}`} value={maxRevisions} onChange={(e) => setMaxRevisions(e.target.value)} />
          {fields.maxRevisions && <div className="invalid-feedback">{fields.maxRevisions}</div>}
        </div>
        <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create milestone'}</button>
      </form>
    </main>
  )
}
