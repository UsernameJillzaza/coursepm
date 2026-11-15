import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

// SDS §3: a visitor without a session is sent to /login. This is only
// navigation; the API still answers 401 on its own (NFR-01).
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="d-flex justify-content-center py-5" role="status" aria-label="Loading">
        <div className="spinner-border" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}
