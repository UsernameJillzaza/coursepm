import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const ROLE_LABEL = { STUDENT: 'Student', SUPERVISOR: 'Supervisor' } as const

// SDS §3 shared layout: name + role, and Log out (AC-01-4).
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
        <Link className="navbar-brand fw-semibold" to="/teams">
          CoursePM
        </Link>
        <div className="d-flex align-items-center gap-3">
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
