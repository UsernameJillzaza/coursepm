import type { ReactNode } from 'react'
import NoAccess from '../components/NoAccess'
import { useAuth, type Role } from './AuthContext'

// F-09 route guard, used inside RequireAuth (so a user is present). A user
// with another role sees NoAccess and the page's own requests are never sent.
export default function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== role) return <NoAccess />
  return <>{children}</>
}
