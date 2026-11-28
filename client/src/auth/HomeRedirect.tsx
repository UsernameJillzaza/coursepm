import { Navigate } from 'react-router-dom'
import { Loading } from '../components/States'
import { homePath, useAuth } from './AuthContext'

// Unknown paths go to the user's start page (F-09: /admin for an ADMIN,
// /teams otherwise; /teams then sends a visitor without a session to /login).
export default function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  return <Navigate to={homePath(user)} replace />
}
