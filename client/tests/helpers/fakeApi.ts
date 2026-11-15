// Minimal fake of the REST API for component tests: routes are keyed as
// "METHOD /api/path" and return { status, body }. Unknown routes → 404.
export type Route = (init?: RequestInit) => { status: number; body?: unknown }

export function fakeApi(routes: Record<string, Route>) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url}`
      calls.push(key)
      const route = routes[key]
      const { status, body } = route
        ? route(init)
        : { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found.' } } }
      return new Response(body === undefined ? null : JSON.stringify(body), { status })
    }),
  )
  return calls
}

export const ok = (body: unknown) => () => ({ status: 200, body })
export const fail = (status: number, code: string, message: string) => () => ({ status, body: { error: { code, message } } })
