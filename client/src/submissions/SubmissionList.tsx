import { bangkokTime } from '../milestones/types'
import type { Submission } from './types'

// F-05 revision list, newest first (FR-08, AC-05-7). F-06 (#8) adds each
// revision's feedback to its card.
export default function SubmissionList({ items }: { items: Submission[] }) {
  if (items.length === 0) return <p className="text-body-secondary">No submissions yet.</p>
  return (
    <div className="d-flex flex-column gap-3">
      {items.map((s) => (
        <article className="card" key={s.id} aria-label={`Revision ${s.revision}`}>
          <div className="card-body">
            <div className="d-flex justify-content-between flex-wrap gap-2">
              <h3 className="h6 mb-1">
                <span className="badge text-bg-primary me-2">Revision {s.revision}</span>
                {s.title}
              </h3>
              <small className="text-body-secondary">
                {s.submittedBy.name} · {bangkokTime(s.submittedAt)}
              </small>
            </div>
            {s.description && <p className="mb-1" style={{ whiteSpace: 'pre-wrap' }}>{s.description}</p>}
            <a href={s.link} target="_blank" rel="noopener noreferrer" className="small text-break">
              {s.link}
            </a>
          </div>
        </article>
      ))}
    </div>
  )
}
