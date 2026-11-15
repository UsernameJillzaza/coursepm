import { useAuth } from '../auth/AuthContext'

// Placeholder landing page after login. Issue #5 (F-03) replaces it with the
// real "My teams" list from GET /api/teams.
export default function TeamsPage() {
  const { user } = useAuth()
  return (
    <main className="container">
      <h1 className="h4">My teams</h1>
      <p className="text-body-secondary">
        Signed in as {user?.email}. Teams are added in Issue #5 (F-03).
      </p>
    </main>
  )
}
