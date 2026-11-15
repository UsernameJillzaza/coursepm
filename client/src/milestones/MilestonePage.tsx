import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ErrorAlert, Loading } from '../components/States'
import { useApi } from '../components/useApi'
import SubmissionList from '../submissions/SubmissionList'
import SubmitForm from '../submissions/SubmitForm'
import type { Submission } from '../submissions/types'
import { bangkokTime, type Milestone } from './types'

// F-05 milestone detail (SDS §3): deadline, "Revisions used: n / max", the
// student submit form, and the revision list with its loading / empty /
// error states (AC-02-10), and revision-specific feedback (F-06).
export default function MilestonePage() {
  const { milestoneId } = useParams()
  const { user } = useAuth()
  const detail = useApi<{ milestone: Milestone; team: { id: number; name: string } }>(`/milestones/${milestoneId}`)
  const subs = useApi<{ items: Submission[] }>(`/milestones/${milestoneId}/submissions`)

  if (detail.loading && !detail.data) return <main className="container"><Loading /></main>
  if (detail.error?.status === 404) {
    return (
      <main className="container">
        <h1 className="h4">Milestone not found</h1>
        <Link to="/teams">Back to My teams</Link>
      </main>
    )
  }
  if (detail.error || !detail.data) {
    return <main className="container"><ErrorAlert message={detail.error?.message ?? 'Error'} onRetry={detail.reload} /></main>
  }

  const { milestone: m, team } = detail.data
  const refresh = () => {
    detail.reload()
    subs.reload()
  }

  return (
    <main className="container">
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link to="/teams">My teams</Link></li>
          <li className="breadcrumb-item"><Link to={`/teams/${team.id}`}>{team.name}</Link></li>
          <li className="breadcrumb-item active" aria-current="page">{m.title}</li>
        </ol>
      </nav>
      <div className="d-flex align-items-center gap-2 mb-1">
        <h1 className="h4 mb-0">{m.title}</h1>
        <span className={`badge ${m.status === 'OPEN' ? 'text-bg-success' : 'text-bg-secondary'}`}>
          {m.status === 'OPEN' ? 'Open' : 'Closed'}
        </span>
      </div>
      <p className="text-body-secondary mb-2">
        Deadline: {bangkokTime(m.deadline)} (Bangkok) · Revisions used: {m.revisionsUsed} / {m.maxRevisions}
      </p>
      {m.description && <p style={{ whiteSpace: 'pre-wrap' }}>{m.description}</p>}

      {user?.role === 'STUDENT' && <SubmitForm milestone={m} onSubmitted={refresh} />}

      <h2 className="h6 mt-4">Submissions</h2>
      {subs.loading && <Loading />}
      {subs.error && <ErrorAlert message={subs.error.message} onRetry={subs.reload} />}
      {!subs.loading && !subs.error && subs.data && <SubmissionList items={subs.data.items} onFeedbackSaved={subs.reload} />}
    </main>
  )
}
