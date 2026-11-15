import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'

// Issue #3 scaffold: the UI calls GET /api/health and shows the result.
describe('App scaffold', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows "connected" when the health check answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 })))
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(await screen.findByText(/API status: connected/)).toBeInTheDocument()
  })

  it('shows "unreachable" when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network') }))
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(await screen.findByText(/API status: unreachable/)).toBeInTheDocument()
  })
})
