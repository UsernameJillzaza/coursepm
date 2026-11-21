import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'
import { fakeApi, fail, ok } from '../helpers/fakeApi'

// Lab 6 regression test for Issue #60 (partner UAT finding DEF-CP-04).
// F-03 UI rule: an out-of-scope or missing team URL shows "Team not found".
// The New milestone page must check the team before it offers the form,
// instead of letting a supervisor fill it in and only failing on submit.

const supervisor = { id: 1, name: 'Dr. Supervisor One', email: 'supervisor1@coursepm.test', role: 'SUPERVISOR' }
const team = { id: 1, name: 'Team Alpha', courseCode: 'CPE334-DEMO', members: [], supervisors: [{ id: 1, name: supervisor.name }] }

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

afterEach(() => vi.unstubAllGlobals())

describe('TEST-L6-60-01 (F-03 UI rule, AC-04-3): New milestone page for a team the supervisor cannot see', () => {
  it('shows Team not found and no form when the team request returns 404', async () => {
    const calls = fakeApi({
      'GET /api/auth/me': ok({ user: supervisor }),
      'GET /api/teams/2': fail(404, 'NOT_FOUND', 'Team not found.'),
    })
    renderAt('/teams/2/milestones/new')
    expect(await screen.findByRole('heading', { name: 'Team not found' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create milestone' })).not.toBeInTheDocument()
    expect(calls).toContain('GET /api/teams/2')
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false)
  })
})

describe('TEST-L6-60-02 (AC-04-1): New milestone page for the supervisor\'s own team', () => {
  it('shows the form, naming the team, once the team has loaded', async () => {
    fakeApi({
      'GET /api/auth/me': ok({ user: supervisor }),
      'GET /api/teams/1': ok({ team }),
    })
    renderAt('/teams/1/milestones/new')
    expect(await screen.findByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByText('Team Alpha', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create milestone' })).toBeInTheDocument()
  })
})
