import { Link, useNavigate } from 'react-router-dom'
import { homePath, useAuth } from '../auth/AuthContext'

const ROLE_LABEL = { STUDENT: 'Student', SUPERVISOR: 'Supervisor', ADMIN: 'Admin' } as const

// SDS §3 shared layout: name + role, and Log out (AC-01-4). F-09: an ADMIN
// gets an Admin link, and the brand goes to /admin instead of My teams.
export default function TopBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  async function onLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <nav className="navbar navbar-expand bg-body-tertiary border-bottom mb-4">
      <div className="container">
        <Link className="navbar-brand fw-semibold" to={homePath(user)}>
          CoursePM
        </Link>
        <div className="d-flex align-items-center gap-3">
          {user.role === 'ADMIN' && (
            <Link className="nav-link" to="/admin">
              Admin
            </Link>
          )}
          <span>{user.name}</span>
          <span className="badge text-bg-secondary">{ROLE_LABEL[user.role]}</span>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>
    </nav>
  )
}
