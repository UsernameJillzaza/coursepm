import { useState, type FormEvent } from 'react'
import { api, ApiError, type FieldErrors } from '../api'
import { ErrorAlert } from '../components/States'
import { bangkokInputToUtc, bangkokShort, inEditWindow, utcToBangkokInput, type Milestone } from './types'

type Panel = 'none' | 'edit' | 'extend' | 'close'

// F-08 supervisor controls on the milestone page (FR-12, FR-13, AC-08-12).
// Edit only inside the edit window; nothing once the milestone is closed
// early. The page never renders this for students. The server enforces every
// rule again; a 400 with fields goes under the inputs (values kept), a
// field-less 400 (NO_CHANGE) or a 409 goes to the alert.
export default function MilestoneMaintenance({ milestone, onChanged }: { milestone: Milestone; onChanged: () => void }) {
  const [panel, setPanel] = useState<Panel>('none')
  if (milestone.closedAt) return null

  return (
    <section className="mb-3" aria-label="Milestone maintenance">
      <div className="d-flex flex-wrap gap-2">
        {inEditWindow(milestone) && (
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setPanel('edit')}>Edit</button>
        )}
        <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setPanel('extend')}>Grant extension</button>
        <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setPanel('close')}>Close milestone</button>
      </div>
      {panel === 'edit' && <EditForm milestone={milestone} onCancel={() => setPanel('none')} onSaved={onChanged} />}
      {panel === 'extend' && <ExtensionForm milestone={milestone} onCancel={() => setPanel('none')} onSaved={onChanged} />}
      {panel === 'close' && <CloseDialog milestone={milestone} onCancel={() => setPanel('none')} onSaved={onChanged} />}
    </section>
  )
}

// Shared submit handling: fields → under the inputs, anything else → alert.
function useSave() {
  const [fields, setFields] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  async function save(send: () => Promise<unknown>, onSaved: () => void) {
    if (saving) return
    setSaving(true)
    setFields({})
    setError(null)
    try {
      await send()
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields)
      else setError(err instanceof ApiError ? err.message : 'Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }
  const invalid = (name: string) => (fields[name] ? ' is-invalid' : '')
  const feedback = (name: string) => fields[name] && <div className="invalid-feedback">{fields[name]}</div>
  return { error, saving, save, invalid, feedback }
}

type FormProps = { milestone: Milestone; onCancel: () => void; onSaved: () => void }

function EditForm({ milestone, onCancel, onSaved }: FormProps) {
  const initialDeadline = utcToBangkokInput(milestone.deadline)
  const [description, setDescription] = useState(milestone.description)
  const [deadline, setDeadline] = useState(initialDeadline)
  const { error, saving, save, invalid, feedback } = useSave()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    // The input has minute precision: an untouched deadline sends the stored
    // instant, so it compares equal on the server.
    const sentDeadline = deadline === initialDeadline ? milestone.deadline : bangkokInputToUtc(deadline)
    void save(() => api(`/milestones/${milestone.id}`, { method: 'PATCH', body: { description, deadline: sentDeadline } }), onSaved)
  }

  return (
    <form onSubmit={onSubmit} noValidate className="card card-body mt-3">
      <h2 className="h6">Edit milestone</h2>
      {error && <ErrorAlert message={error} />}
      <div className="mb-2">
        <label htmlFor="edit-description" className="form-label">Description</label>
        <textarea id="edit-description" rows={4} className={`form-control${invalid('description')}`} value={description} onChange={(e) => setDescription(e.target.value)} />
        {feedback('description')}
      </div>
      <div className="mb-3">
        <label htmlFor="edit-deadline" className="form-label">Deadline (Bangkok time)</label>
        <input id="edit-deadline" type="datetime-local" className={`form-control${invalid('deadline')}`} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        {feedback('deadline')}
      </div>
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function ExtensionForm({ milestone, onCancel, onSaved }: FormProps) {
  const [newDeadline, setNewDeadline] = useState('')
  const [reason, setReason] = useState('')
  const { error, saving, save, invalid, feedback } = useSave()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void save(() => api(`/milestones/${milestone.id}/extensions`, { method: 'POST', body: { newDeadline: bangkokInputToUtc(newDeadline), reason } }), onSaved)
  }

  return (
    <form onSubmit={onSubmit} noValidate className="card card-body mt-3">
      <h2 className="h6">Grant extension</h2>
      {error && <ErrorAlert message={error} />}
      <div className="mb-2">
        <label htmlFor="ext-deadline" className="form-label">New deadline (Bangkok time)</label>
        <input id="ext-deadline" type="datetime-local" className={`form-control${invalid('newDeadline')}`} value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />
        <div className="form-text">Current deadline: {bangkokShort(milestone.deadline)} (Bangkok)</div>
        {feedback('newDeadline')}
      </div>
      <div className="mb-3">
        <label htmlFor="ext-reason" className="form-label">Reason</label>
        <textarea id="ext-reason" rows={2} className={`form-control${invalid('reason')}`} value={reason} onChange={(e) => setReason(e.target.value)} />
        {feedback('reason')}
      </div>
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save extension'}</button>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function CloseDialog({ milestone, onCancel, onSaved }: FormProps) {
  const [reason, setReason] = useState('')
  const { error, saving, save, invalid, feedback } = useSave()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const body = reason.trim() ? { reason } : {}
    void save(() => api(`/milestones/${milestone.id}/close`, { method: 'POST', body }), onSaved)
  }

  return (
    <form onSubmit={onSubmit} noValidate className="card card-body mt-3 border-danger" role="dialog" aria-labelledby="close-title">
      <h2 className="h6" id="close-title">Close milestone?</h2>
      <p>Students can no longer submit to this milestone. This cannot be undone.</p>
      {error && <ErrorAlert message={error} />}
      <div className="mb-3">
        <label htmlFor="close-reason" className="form-label">Reason (optional)</label>
        <textarea id="close-reason" rows={2} className={`form-control${invalid('reason')}`} value={reason} onChange={(e) => setReason(e.target.value)} />
        {feedback('reason')}
      </div>
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-danger btn-sm" disabled={saving}>Close milestone</button>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
