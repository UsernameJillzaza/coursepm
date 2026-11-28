import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, SESSION_LOST_EVENT } from '../api'

export type Role = 'STUDENT' | 'SUPERVISOR' | 'ADMIN'
export type User = { id: number; name: string; email: string; role: Role }

// F-09: where each role starts. An ADMIN has no teams, so it starts on /admin.
export function homePath(user: Pick<User, 'role'> | null): string {
  return user?.role === 'ADMIN' ? '/admin' : '/teams'
}

type AuthState = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

// Holds the current user for the whole app. The source of truth is always the
// server (GET /api/auth/me); the role shown here only decides which buttons
// to display. The backend still enforces every permission (NFR-02).
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // AC-02-7: any 401 from the API means the session is gone.
  useEffect(() => {
    const onLost = () => setUser(null)
    window.addEventListener(SESSION_LOST_EVENT, onLost)
    return () => window.removeEventListener(SESSION_LOST_EVENT, onLost)
  }, [])

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ user: User }>('/auth/login', { method: 'POST', body: { email, password } })
    setUser(r.user)
    return r.user
  }, [])

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
