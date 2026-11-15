import { useEffect, useState } from 'react'
import { api } from './api'

// Issue #3 scaffold: proves UI → API wiring. Replaced by the routed app in F-01.
export default function App() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  useEffect(() => {
    api<{ status: string }>('/health')
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'))
  }, [])
  return (
    <main className="container py-5">
      <h1 className="h3">CoursePM</h1>
      <p>API status: {status === 'loading' ? 'checking…' : status === 'ok' ? 'connected' : 'unreachable'}</p>
    </main>
  )
}
