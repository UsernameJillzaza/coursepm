import { Link } from 'react-router-dom'
import { ErrorAlert, Loading } from '../components/States'
import { useApi } from '../components/useApi'
import type { Team } from './types'

// F-03 "My teams" (FR-03, AC-03-1). The API already limits the list to the
// user's own or assigned teams (F-02); the page just shows what it gets.
export default function TeamsPage() {
  const { data, error, loading, reload } = useApi<{ items: Team[] }>('/teams')

  return (
    <main className="container">
      <h1 className="h4 mb-3">My teams</h1>
      {loading && <Loading />}
      {error && <ErrorAlert message={error.message} onRetry={reload} />}
      {data && data.items.length === 0 && <p className="text-body-secondary">You are not in any team yet.</p>}
      {data && data.items.length > 0 && (
        <div className="row g-3">
          {data.items.map((t) => (
            <div className="col-md-6 col-lg-4" key={t.id}>
              <div className="card h-100">
                <div className="card-body">
                  <h2 className="h5 card-title">
                    <Link to={`/teams/${t.id}`} className="stretched-link text-decoration-none">
                      {t.name}
                    </Link>
                  </h2>
                  <p className="card-subtitle mb-2 text-body-secondary small">{t.courseCode}</p>
                  <p className="mb-1 small">
                    <strong>Members:</strong> {t.members.map((m) => m.name).join(', ') || 'none'}
                  </p>
                  <p className="mb-0 small">
                    <strong>Supervisors:</strong> {t.supervisors.map((s) => s.name).join(', ') || 'none'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
