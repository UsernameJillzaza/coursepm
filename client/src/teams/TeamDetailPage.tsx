import { Link, useParams } from 'react-router-dom'
import { ErrorAlert, Loading } from '../components/States'
import { useApi } from '../components/useApi'
import type { Team } from './types'

// F-03 team detail: name, course, members, supervisors. The milestone list
// is added here by F-04 (Issue #6).
export default function TeamDetailPage() {
  const { teamId } = useParams()
  const { data, error, loading, reload } = useApi<{ team: Team }>(`/teams/${teamId}`)

  if (loading) return <main className="container"><Loading /></main>
  if (error?.status === 404) {
    return (
      <main className="container">
        <h1 className="h4">Team not found</h1>
        <p className="text-body-secondary">It doesn't exist, or you aren't a member or supervisor of it.</p>
        <Link to="/teams">Back to My teams</Link>
      </main>
    )
  }
  if (error || !data) return <main className="container"><ErrorAlert message={error?.message ?? 'Error'} onRetry={reload} /></main>

  const { team } = data
  return (
    <main className="container">
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link to="/teams">My teams</Link></li>
          <li className="breadcrumb-item active" aria-current="page">{team.name}</li>
        </ol>
      </nav>
      <h1 className="h4 mb-0">{team.name}</h1>
      <p className="text-body-secondary">{team.courseCode}</p>
      <div className="row g-4">
        <section className="col-md-4">
          <h2 className="h6">Members</h2>
          <ul className="list-group mb-3">
            {team.members.map((m) => (
              <li className="list-group-item" key={m.id} aria-label={m.name}>{m.name}</li>
            ))}
          </ul>
          <h2 className="h6">Supervisors</h2>
          <ul className="list-group">
            {team.supervisors.map((s) => (
              <li className="list-group-item" key={s.id} aria-label={s.name}>{s.name}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
