import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ErrorAlert, Loading } from '../components/States'
import { useApi } from '../components/useApi'
import { bangkokTime, type Milestone } from './types'

export default function MilestoneList({ teamId }: { teamId: number }) {
  const { user } = useAuth()
  const { data, error, loading, reload } = useApi<{ items: Milestone[] }>(`/teams/${teamId}/milestones`)

  return (
    <section className="mt-4" aria-labelledby="milestones-heading">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h5 mb-0" id="milestones-heading">Milestones</h2>
        {user?.role === 'SUPERVISOR' && (
          <Link className="btn btn-primary btn-sm" to={`/teams/${teamId}/milestones/new`}>New milestone</Link>
        )}
      </div>
      {loading && <Loading />}
      {error && <ErrorAlert message={error.message} onRetry={reload} />}
      {!loading && !error && data?.items.length === 0 && <p className="text-body-secondary">No milestones yet.</p>}
      {!loading && !error && data?.items && data.items.length > 0 && (
        <ul className="list-group">
          {data.items.map((milestone) => (
            <li className="list-group-item" key={milestone.id}>
              <div className="d-flex justify-content-between gap-2">
                <strong><Link to={`/milestones/${milestone.id}`}>{milestone.title}</Link></strong>
                <span className="d-flex gap-1 align-items-start">
                  <span className={`badge ${milestone.status === 'OPEN' ? 'text-bg-success' : 'text-bg-secondary'}`}>
                    {milestone.status === 'OPEN' ? 'Open' : 'Closed'}
                  </span>
                  {milestone.closedAt && <span className="badge text-bg-dark">Closed early</span>}
                  {milestone.extended && <span className="badge text-bg-info">Extended</span>}
                </span>
              </div>
              <div className="text-body-secondary small">Deadline: {bangkokTime(milestone.deadline)} (Bangkok)</div>
              <div className="small">{milestone.revisionsUsed} / {milestone.maxRevisions} revisions</div>
              {milestone.latestSubmittedAt && (
                <div className="text-body-secondary small">Latest submission: {bangkokTime(milestone.latestSubmittedAt)} (Bangkok)</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
