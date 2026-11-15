import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'
import { fail, fakeApi, ok } from '../helpers/fakeApi'

// F-03 UI (AC-03-1, AC-03-5) and the team part of TEST-UI-04 (AC-02-10): My teams list with loading/empty/error states,
// and the team detail page with members; out-of-scope → "not found".
const student = { id: 3, name: 'Alpha Student 1', email: 'alpha1@coursepm.test', role: 'STUDENT' }
const alpha = {
  id: 1,
  name: 'Team Alpha',
  courseCode: 'CPE334-DEMO',
  members: [
    { id: 3, name: 'Alpha Student 1' },
    { id: 4, name: 'Alpha Student 2' },
  ],
  supervisors: [{ id: 1, name: 'Dr. Supervisor One' }],
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('F-03 My teams page', () => {
  it('TEST-UI-04 team part (AC-02-10): shows a loading state while the list is pending', async () => {
    // /me answers, the team list never does, so the page stays in its loading state.
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/auth/me'
          ? Promise.resolve(new Response(JSON.stringify({ user: student }), { status: 200 }))
          : new Promise<Response>(() => {}),
      ),
    )
    renderAt('/teams')
    // Wait for the page itself (the session check shows its own spinner first),
    // then the list's loading indicator must be there and no list or empty text.
    expect(await screen.findByRole('heading', { name: 'My teams' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
    expect(screen.queryByText('You are not in any team yet.')).not.toBeInTheDocument()
  })

  it('AC-03-1: lists the teams from the API with members and supervisors', async () => {
    fakeApi({ 'GET /api/auth/me': ok({ user: student }), 'GET /api/teams': ok({ items: [alpha] }) })
    renderAt('/teams')
    expect(await screen.findByRole('link', { name: /team alpha/i })).toBeInTheDocument()
    expect(screen.getByText(/Alpha Student 2/)).toBeInTheDocument()
    expect(screen.getByText(/Dr\. Supervisor One/)).toBeInTheDocument()
  })

  it('TEST-UI-04 team part (AC-02-10): shows the empty state when the user is in no team', async () => {
    fakeApi({ 'GET /api/auth/me': ok({ user: student }), 'GET /api/teams': ok({ items: [] }) })
    renderAt('/teams')
    expect(await screen.findByText('You are not in any team yet.')).toBeInTheDocument()
  })

  it('TEST-UI-04 team part (AC-02-10): shows an error with Retry, and Retry loads the list again', async () => {
    let attempt = 0
    fakeApi({
      'GET /api/auth/me': ok({ user: student }),
      'GET /api/teams': () => (++attempt === 1 ? fail(500, 'INTERNAL_ERROR', 'Unexpected server error.')() : ok({ items: [alpha] })()),
    })
    renderAt('/teams')
    expect(await screen.findByRole('alert')).toHaveTextContent('Unexpected server error.')
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByRole('link', { name: /team alpha/i })).toBeInTheDocument()
  })
})

describe('F-03 team detail page', () => {
  it('shows the team name, course and member list', async () => {
    fakeApi({ 'GET /api/auth/me': ok({ user: student }), 'GET /api/teams/1': ok({ team: alpha }) })
    renderAt('/teams/1')
    expect(await screen.findByRole('heading', { name: 'Team Alpha' })).toBeInTheDocument()
    expect(screen.getByText('CPE334-DEMO')).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Alpha Student 2' })).toBeInTheDocument()
  })

  it('AC-03-5: a 404 from the API shows "Team not found" and no team data', async () => {
    fakeApi({ 'GET /api/auth/me': ok({ user: student }), 'GET /api/teams/2': fail(404, 'NOT_FOUND', 'Team not found.') })
    renderAt('/teams/2')
    expect(await screen.findByRole('heading', { name: 'Team not found' })).toBeInTheDocument()
  })
})
