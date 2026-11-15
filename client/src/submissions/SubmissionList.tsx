import { bangkokTime } from '../milestones/types'
import { useAuth } from '../auth/AuthContext'
import FeedbackForm from '../feedback/FeedbackForm'
import type { Submission } from './types'

// Each revision owns its feedback. A later submission leaves the feedback on
// the earlier revision's card (BR-09).
export default function SubmissionList({ items, onFeedbackSaved }: { items: Submission[]; onFeedbackSaved: () => void }) {
  const { user } = useAuth()
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
            {s.feedback ? (
              <section className="border-top mt-3 pt-3" aria-label={`Feedback for revision ${s.revision}`}>
                <h4 className="h6">Feedback</h4>
                <p className="small text-body-secondary mb-1">
                  {s.feedback.supervisor.name} · {bangkokTime(s.feedback.createdAt)} (Bangkok)
                </p>
                <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{s.feedback.body}</p>
              </section>
            ) : user?.role === 'SUPERVISOR' ? (
              <FeedbackForm submissionId={s.id} revision={s.revision} onSaved={onFeedbackSaved} />
            ) : (
              <p className="text-body-secondary mb-0 mt-3">No feedback yet</p>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
