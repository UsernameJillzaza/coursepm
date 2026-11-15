// Thin fetch wrapper. The session cookie is HttpOnly, so the browser sends it
// automatically (same origin through the Vite proxy); JS never reads it.
export type FieldErrors = Record<string, string>

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: FieldErrors
  constructor(status: number, code: string, message: string, fields: FieldErrors = {}) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = data?.error ?? {}
    throw new ApiError(res.status, err.code ?? 'INTERNAL_ERROR', err.message ?? 'Something went wrong.', err.fields)
  }
  return data as T
}
