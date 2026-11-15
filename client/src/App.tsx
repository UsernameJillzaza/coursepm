import { useEffect, useState } from 'react'
import { api } from './api'

// Issue #3 scaffold: proves UI → API wiring. Replaced by the routed app in F-01.
export default function App() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  useEffect(() => {
    // AC-R02-1: only a 200 whose body says status "ok" counts as connected;
    // an unhealthy body, an error status or a network failure is unreachable.
    api<{ status?: string }>('/health')
      .then((body) => setStatus(body?.status === 'ok' ? 'ok' : 'error'))
      .catch(() => setStatus('error'))
  }, [])
  return (
    <main className="container py-5">
      <h1 className="h3">CoursePM</h1>
      <p>API status: {status === 'loading' ? 'checking…' : status === 'ok' ? 'connected' : 'unreachable'}</p>
    </main>
  )
}
