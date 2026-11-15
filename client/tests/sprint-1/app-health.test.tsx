import { render, screen } from '@testing-library/react'
import HealthStatus from '../../src/components/HealthStatus'

// TEST-R02-01 (AC-R02-1), component part, kept after F-01: the API status
// indicator (now in the login page footer) shows checking… → connected /
// unreachable. The build part is `npm --prefix client run build` exiting 0.
const healthy = { status: 'ok', service: 'CoursePM API' }

describe('TEST-R02-01 API status indicator', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows "API status: checking…" while the health request is pending', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    render(<HealthStatus />)
    expect(await screen.findByText('API status: checking…')).toBeInTheDocument()
  })

  it('shows "API status: connected" on 200 with the expected health body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(healthy), { status: 200 })))
    render(<HealthStatus />)
    expect(await screen.findByText('API status: connected')).toBeInTheDocument()
  })

  it('shows "API status: unreachable" when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network') }))
    render(<HealthStatus />)
    expect(await screen.findByText('API status: unreachable')).toBeInTheDocument()
  })

  it('shows "API status: unreachable" for an unhealthy 200 response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'degraded' }), { status: 200 })))
    render(<HealthStatus />)
    expect(await screen.findByText('API status: unreachable')).toBeInTheDocument()
  })

  it('shows "API status: unreachable" for an error status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'x' } }), { status: 500 })))
    render(<HealthStatus />)
    expect(await screen.findByText('API status: unreachable')).toBeInTheDocument()
  })
})
