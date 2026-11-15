import { useEffect, useState } from 'react'
import { api } from '../api'

// Issue #3 scaffold check, kept as a small footer indicator: proves UI → API wiring.
export default function HealthStatus() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  useEffect(() => {
    // AC-R02-1: only a 200 whose body says status "ok" counts as connected;
    // an unhealthy body, an error status or a network failure is unreachable.
    api<{ status?: string }>('/health')
      .then((body) => setStatus(body?.status === 'ok' ? 'ok' : 'error'))
      .catch(() => setStatus('error'))
  }, [])
  const text = status === 'loading' ? 'checking…' : status === 'ok' ? 'connected' : 'unreachable'
  return <small className="text-body-secondary">API status: {text}</small>
}
