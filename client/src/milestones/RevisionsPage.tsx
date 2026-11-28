import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { ErrorAlert, Loading } from '../components/States'
import { useApi } from '../components/useApi'
import type { Submission } from '../submissions/types'
import { bangkokTime, type Milestone } from './types'

// F-07 Revision history and comparison (FR-11, AC-07-7, AC-07-8). Read-only:
// the list is the F-05 list, and the comparison is computed by the server on
// request. The selection lives in the URL (?a=<older>&b=<newer>), so a
// reload or a shared link shows the same comparison.

type Part = { op: 'same' | 'removed' | 'added'; text: string }
type Comparison = {
  milestoneId: number
  older: Submission
  newer: Submission
  changes: { title: { changed: boolean }; link: { changed: boolean }; description: { changed: boolean; parts: Part[] } }
}
type CompareState = { loading: boolean; data: Comparison | null; error: string }

function NotFound() {
  return (
    <main className="container">
      <h1 className="h4">Milestone not found</h1>
      <Link to="/teams">Back to My teams</Link>
    </main>
  )
}

export default function RevisionsPage() {
  const { milestoneId } = useParams()
  const [params, setParams] = useSearchParams()
  const a = params.get('a')
  const b = params.get('b')
  const detail = useApi<{ milestone: Milestone; team: { id: number; name: string } }>(`/milestones/${milestoneId}`)
  const list = useApi<{ items: Submission[] }>(`/milestones/${milestoneId}/submissions`)
  const [selected, setSelected] = useState<number[]>([])
  const [compare, setCompare] = useState<CompareState>({ loading: false, data: null, error: '' })
  const [milestoneMissing, setMilestoneMissing] = useState(false)

  // The URL decides what is compared; the checkboxes start from it.
  useEffect(() => {
    if (!a || !b) {
      setCompare({ loading: false, data: null, error: '' })
      return
    }
    const fromUrl = [Number(a), Number(b)].filter((n) => Number.isInteger(n) && n > 0)
    setSelected([...new Set(fromUrl)])
    let cancelled = false
    setCompare({ loading: true, data: null, error: '' })
    api<{ comparison: Comparison }>(`/milestones/${milestoneId}/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`)
      .then((r) => !cancelled && setCompare({ loading: false, data: r.comparison, error: '' }))
      .catch((e) => {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 404 && e.message === 'Milestone not found.') setMilestoneMissing(true)
        const message = e instanceof ApiError
          ? e.status === 400 ? 'Choose two different revisions to compare.' : e.message
          : 'Could not reach the server.'
        setCompare({ loading: false, data: null, error: message })
      })
    return () => {
      cancelled = true
    }
  }, [milestoneId, a, b])

  if (detail.error?.status === 404 || list.error?.status === 404 || milestoneMissing) return <NotFound />
  if (detail.loading && !detail.data) return <main className="container"><Loading /></main>
  if (detail.error || !detail.data) {
    return <main className="container"><ErrorAlert message={detail.error?.message ?? 'Error'} onRetry={detail.reload} /></main>
  }

  const { milestone: m, team } = detail.data
  const items = list.data?.items ?? []
  // A number from a hand-edited URL that is not in the list is never kept
  // selected, so it cannot block the checkboxes.
  const chosen = selected.filter((r) => items.some((s) => s.revision === r))

  function toggle(revision: number) {
    setSelected(chosen.includes(revision) ? chosen.filter((r) => r !== revision) : chosen.length < 2 ? [...chosen, revision] : chosen)
  }
  function onCompare() {
    const [older, newer] = [...chosen].sort((x, y) => x - y)
    setParams({ a: String(older), b: String(newer) })
  }

  return (
    <main className="container">
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link to="/teams">My teams</Link></li>
          <li className="breadcrumb-item"><Link to={`/teams/${team.id}`}>{team.name}</Link></li>
          <li className="breadcrumb-item"><Link to={`/milestones/${m.id}`}>{m.title}</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Compare revisions</li>
        </ol>
      </nav>
      <h1 className="h4 mb-1">Compare revisions: {m.title}</h1>
      <p className="text-body-secondary mb-3">Deadline: {bangkokTime(m.deadline)} (Bangkok)</p>

      {list.loading && <Loading />}
      {list.error && <ErrorAlert message={list.error.message} onRetry={list.reload} />}
      {list.data && items.length === 0 && <p className="text-body-secondary">No revisions yet.</p>}
      {list.data && items.length > 0 && (
        <>
          {items.length === 1 && <p className="text-body-secondary">Only one revision so far; compare needs two.</p>}
          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th scope="col"><span className="visually-hidden">Select</span></th>
                  <th scope="col">Revision</th>
                  <th scope="col">Title</th>
                  <th scope="col">Submitted by</th>
                  <th scope="col">Time (Bangkok)</th>
                  <th scope="col">Feedback</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => {
                  const checked = chosen.includes(s.revision)
                  return (
                    <tr key={s.id}>
                      <td>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          aria-label={`Select revision ${s.revision}`}
                          checked={checked}
                          disabled={!checked && chosen.length >= 2}
                          onChange={() => toggle(s.revision)}
                        />
                      </td>
                      <td>{s.revision}</td>
                      <td className="text-break">{s.title}</td>
                      <td>{s.submittedBy.name}</td>
                      <td>{bangkokTime(s.submittedAt)}</td>
                      <td>{s.feedback ? 'Feedback given' : 'No feedback yet'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-primary mb-4" disabled={chosen.length !== 2} onClick={onCompare}>
            Compare
          </button>
        </>
      )}

      {compare.error && <div className="alert alert-danger" role="alert">{compare.error}</div>}
      {compare.loading && <Loading />}
      {compare.data && <ComparisonPanel comparison={compare.data} />}
    </main>
  )
}

function ChangeBadge({ field, changed }: { field: string; changed: boolean }) {
  return (
    <span data-testid={`badge-${field}`} className={`badge ms-2 ${changed ? 'text-bg-warning' : 'text-bg-light border'}`}>
      {changed ? 'Changed' : 'Unchanged'}
    </span>
  )
}

function ComparisonPanel({ comparison }: { comparison: Comparison }) {
  const { older, newer, changes } = comparison
  return (
    <section aria-labelledby="comparison-heading" className="mb-4">
      <h2 id="comparison-heading" className="h5">Comparison</h2>
      <p className="small mb-2">
        Title<ChangeBadge field="title" changed={changes.title.changed} />
        <span className="ms-3">Link</span><ChangeBadge field="link" changed={changes.link.changed} />
        <span className="ms-3">Description</span><ChangeBadge field="description" changed={changes.description.changed} />
      </p>
      <div className="row g-3">
        <div className="col-12 col-md-6">
          <RevisionSide side="older" revision={older} parts={changes.description.parts} />
        </div>
        <div className="col-12 col-md-6">
          <RevisionSide side="newer" revision={newer} parts={changes.description.parts} />
        </div>
      </div>
    </section>
  )
}

// The older side shows same + removed (struck through); the newer side shows
// same + added (highlighted). Joining them gives back each stored description.
function RevisionSide({ side, revision: r, parts }: { side: 'older' | 'newer'; revision: Submission; parts: Part[] }) {
  const headingId = `revision-${side}-heading`
  const shown = parts.filter((p) => p.op === 'same' || p.op === (side === 'older' ? 'removed' : 'added'))
  return (
    <article className="card h-100" aria-labelledby={headingId}>
      <div className="card-body text-break">
        <h3 id={headingId} className="h6">Revision {r.revision} ({side})</h3>
        <p className="small text-body-secondary mb-2">{r.submittedBy.name} · {bangkokTime(r.submittedAt)} (Bangkok)</p>
        <p className="mb-1"><strong>Title:</strong> {r.title}</p>
        <p className="mb-1">
          <strong>Link:</strong>{' '}
          <a href={r.link} target="_blank" rel="noopener noreferrer">{r.link}</a>
        </p>
        <div className="mb-2">
          <strong>Description:</strong>
          <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
            {shown.length === 0 && <span className="text-body-secondary">(empty)</span>}
            {shown.map((p, i) =>
              p.op === 'same' ? <span key={i}>{p.text}</span>
                : p.op === 'removed' ? <del key={i} className="text-danger">{p.text}</del>
                  : <ins key={i} className="bg-success-subtle text-decoration-none">{p.text}</ins>,
            )}
          </p>
        </div>
        <div className="border-top pt-2">
          <strong className="small">Feedback</strong>
          {r.feedback ? (
            <>
              <p className="small text-body-secondary mb-1">{r.feedback.supervisor.name} · {bangkokTime(r.feedback.createdAt)} (Bangkok)</p>
              <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{r.feedback.body}</p>
            </>
          ) : (
            <p className="text-body-secondary mb-0">No feedback yet</p>
          )}
        </div>
      </div>
    </article>
  )
}
