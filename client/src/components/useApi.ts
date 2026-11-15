import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../api'

// R-02 shared list/detail loading: data, loading, error, and a reload()
// for the Retry button (NFR-10).
export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    api<T>(path)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK', 'Could not reach the server.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [path, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { data, error, loading, reload }
}
