import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'

// TEST-R02-01 (AC-R02-1), component part: the starter app calls GET
// /api/health and shows checking… → connected / unreachable. The build part
// of TEST-R02-01 is `npm --prefix client run build` exiting 0.
const healthy = { status: 'ok', service: 'CoursePM API' }

function renderApp() {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  )
}

describe('TEST-R02-01 starter app API status', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows "API status: checking…" while the health request is pending', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    renderApp()
    expect(await screen.findByText('API status: checking…')).toBeInTheDocument()
  })

  it('shows "API status: connected" on 200 with the expected health body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(healthy), { status: 200 })))
    renderApp()
    expect(await screen.findByText('API status: connected')).toBeInTheDocument()
  })

  it('shows "API status: unreachable" when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network') }))
    renderApp()
    expect(await screen.findByText('API status: unreachable')).toBeInTheDocument()
  })

  it('shows "API status: unreachable" for an unhealthy 200 response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'degraded' }), { status: 200 })))
    renderApp()
    expect(await screen.findByText('API status: unreachable')).toBeInTheDocument()
  })

  it('shows "API status: unreachable" for an error status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'x' } }), { status: 500 })))
    renderApp()
    expect(await screen.findByText('API status: unreachable')).toBeInTheDocument()
  })
})
