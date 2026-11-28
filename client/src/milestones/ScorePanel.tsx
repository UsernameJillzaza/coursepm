import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, type FieldErrors } from '../api'
import { ErrorAlert } from '../components/States'
import { useApi } from '../components/useApi'
import { bangkokShort } from './types'

// F-11 Score panel (FR-16, BR-12, D-10, AC-11-10). The server decides what a
// role may see: a supervisor gets the full view, a student only the released
// value. The panel never computes visibility itself; hiding controls is not
// the protection (NFR-02).

type Person = { id: number; name: string }
type Change = { kind: 'SET' | 'RELEASE'; oldValue: number | null; newValue: number | null; reason: string | null; by: Person; at: string }
type SupervisorScore = { value: number; releasedAt: string | null; releasedBy: Person | null; history: Change[] }
type StudentScore = { value: number; releasedAt: string }

function historyLine(c: Change) {
  if (c.kind === 'RELEASE') return `Released · ${c.by.name} · ${bangkokShort(c.at)}`
  const values = `${c.oldValue ?? '—'} → ${c.newValue}`
  return [values, c.reason, c.by.name, bangkokShort(c.at)].filter(Boolean).join(' · ')
}

export default function ScorePanel({ milestoneId, teamName, role }: { milestoneId: number; teamName: string; role: 'STUDENT' | 'SUPERVISOR' }) {
  const load = useApi<{ score: SupervisorScore | StudentScore | null }>(`/milestones/${milestoneId}/score`)
  // A 404 means the milestone itself is out of scope; the page already says so.
  if (load.error?.status === 404) return null

  return (
    <section className="card card-body my-3" aria-labelledby="score-heading">
      <h2 id="score-heading" className="h6">Score</h2>
      {/* Not the shared <Loading /> spinner (role="status", "Loading"): the page's revision
          list owns that one, and Sprint 1's TEST-UI-04 finds exactly one (as F-08's history does). */}
      {load.loading && <p className="small text-body-secondary mb-0" aria-busy="true">Loading score…</p>}
      {load.error && <ErrorAlert message={load.error.message} onRetry={load.reload} />}
      {load.data && role === 'STUDENT' && <StudentView score={load.data.score as StudentScore | null} />}
      {load.data && role === 'SUPERVISOR' && (
        <SupervisorView milestoneId={milestoneId} teamName={teamName} initial={load.data.score as SupervisorScore | null} />
      )}
    </section>
  )
}

function StudentView({ score }: { score: StudentScore | null }) {
  if (!score) return <p className="mb-0 text-body-secondary">Score not released yet.</p>
  return <p className="mb-0">{`Score: ${score.value} / 100 (released ${bangkokShort(score.releasedAt)})`}</p>
}

function SupervisorView({ milestoneId, teamName, initial }: { milestoneId: number; teamName: string; initial: SupervisorScore | null }) {
  const [score, setScore] = useState<SupervisorScore | null>(initial)
  const [value, setValue] = useState(initial ? String(initial.value) : '')
  const [reason, setReason] = useState('')
  const [fields, setFields] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => setScore(initial), [initial])

  const isReleased = Boolean(score?.releasedAt)

  async function run(send: () => Promise<{ score: SupervisorScore }>) {
    if (saving) return
    setSaving(true)
    setFields({})
    setError('')
    try {
      const res = await send()
      setScore(res.score)
      setValue(res.score ? String(res.score.value) : '')
      setReason('')
    } catch (caught) {
      // Field errors go under the inputs (values kept); NO_CHANGE and 409 go to the alert.
      if (caught instanceof ApiError && Object.keys(caught.fields).length) setFields(caught.fields)
      else setError(caught instanceof ApiError ? caught.message : 'Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  function onSave(e: FormEvent) {
    e.preventDefault()
    const body = { score: value.trim() === '' ? null : Number(value), ...(isReleased ? { reason } : {}) }
    void run(() => api(`/milestones/${milestoneId}/score`, { method: 'PUT', body }))
  }

  function onRelease() {
    setConfirming(false)
    void run(() => api(`/milestones/${milestoneId}/score/release`, { method: 'POST' }))
  }

  return (
    <>
      <p className="small mb-2">
        {!score ? 'No score yet.' : isReleased
          ? `Released ${bangkokShort(score.releasedAt!)} by ${score.releasedBy?.name ?? 'a supervisor'}`
          : 'Not released'}
      </p>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <form onSubmit={onSave} noValidate className="mb-2">
        <div className="mb-2" style={{ maxWidth: 200 }}>
          <label htmlFor="score-value" className="form-label">Score (0–100)</label>
          <input
            id="score-value" type="number" min={0} max={100} step={1}
            className={`form-control${fields.score ? ' is-invalid' : ''}`}
            value={value} onChange={(e) => setValue(e.target.value)}
          />
          {fields.score && <div className="invalid-feedback">{fields.score}</div>}
        </div>
        {isReleased && (
          <div className="mb-2">
            <label htmlFor="score-reason" className="form-label">Reason for change (required after release)</label>
            <textarea
              id="score-reason" rows={2} required
              className={`form-control${fields.reason ? ' is-invalid' : ''}`}
              value={reason} onChange={(e) => setReason(e.target.value)}
            />
            {fields.reason && <div className="invalid-feedback">{fields.reason}</div>}
          </div>
        )}
        <div className="d-flex gap-2">
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>Save score</button>
          {score && !isReleased && (
            <button type="button" className="btn btn-outline-success btn-sm" disabled={saving} onClick={() => setConfirming(true)}>
              Release score
            </button>
          )}
        </div>
      </form>

      {score && score.history.length > 0 && (
        <ul className="list-unstyled small mb-0" aria-label="Score history">
          {score.history.map((c, i) => <li key={i}>{historyLine(c)}</li>)}
        </ul>
      )}

      {confirming && (
        <>
          <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="release-text">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-body">
                  <p id="release-text" className="mb-0">
                    {`Students of ${teamName} will see this score. After release, every change needs a reason.`}
                  </p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} autoFocus>Cancel</button>
                  <button type="button" className="btn btn-success" onClick={onRelease}>Release</button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop show" />
        </>
      )}
    </>
  )
}
