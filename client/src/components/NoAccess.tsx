import { Link } from 'react-router-dom'

// F-09 shared "no access" page, reused by F-12. Shown by RequireRole when the
// signed-in user has another role. It is only navigation: the API still
// answers 403 to every call the page would make (NFR-02).
export default function NoAccess() {
  return (
    <main className="container">
      <h1 className="h4">No access</h1>
      <p className="text-body-secondary">You don't have access to this page.</p>
      <Link to="/teams">Back to My teams</Link>
    </main>
  )
}
