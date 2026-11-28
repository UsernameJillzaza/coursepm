import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'
import { fail, fakeApi, ok } from '../helpers/fakeApi'

const supervisor = { id: 1, name: 'Dr. Supervisor One', email: 'supervisor1@coursepm.test', role: 'SUPERVISOR' }
const student = { id: 2, name: 'Alpha Student 1', email: 'alpha1@coursepm.test', role: 'STUDENT' }
const team = { id: 1, name: 'Team Alpha', courseCode: 'CPE334-DEMO', members: [{ id: 2, name: student.name }], supervisors: [{ id: 1, name: supervisor.name }] }
const milestone = { id: 5, teamId: 1, title: 'Proposal', description: '', deadline: '2026-12-01T08:00:00.000Z', maxRevisions: 3, revisionsUsed: 0, status: 'OPEN', latestSubmittedAt: null, awaitingFeedback: false }

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

afterEach(() => vi.unstubAllGlobals())

describe('F-04 milestone UI', () => {
  it('shows ordered milestones with status, revision count and Bangkok deadline; only supervisors see New milestone', async () => {
    fakeApi({
      'GET /api/auth/me': ok({ user: supervisor }),
      'GET /api/teams/1': ok({ team }),
      'GET /api/teams/1/milestones': ok({ items: [milestone, { ...milestone, id: 6, title: 'Archive', status: 'CLOSED' }] }),
    })
    renderAt('/teams/1')
    expect(await screen.findByText('Proposal')).toBeInTheDocument()
    expect(screen.getAllByText('0 / 3 revisions')).toHaveLength(2)
    expect(screen.getAllByText('01 Dec 2026 15:00', { exact: false })).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'New milestone' })).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('AC-04-7: a student sees milestones but no New milestone control', async () => {
    fakeApi({
      'GET /api/auth/me': ok({ user: student }),
      'GET /api/teams/1': ok({ team }),
      'GET /api/teams/1/milestones': ok({ items: [milestone] }),
    })
    renderAt('/teams/1')
    expect(await screen.findByText('Proposal')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'New milestone' })).not.toBeInTheDocument()
  })

  it('TEST-UI-04 milestone part (AC-02-10): shows an empty list', async () => {
    fakeApi({ 'GET /api/auth/me': ok({ user: student }), 'GET /api/teams/1': ok({ team }), 'GET /api/teams/1/milestones': ok({ items: [] }) })
    renderAt('/teams/1')
    expect(await screen.findByText('No milestones yet.')).toBeInTheDocument()
  })

  it('TEST-UI-04 milestone part (AC-02-10): shows loading while the milestone request is pending', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/auth/me') return Promise.resolve(new Response(JSON.stringify({ user: student }), { status: 200 }))
      if (url === '/api/teams/1') return Promise.resolve(new Response(JSON.stringify({ team }), { status: 200 }))
      return new Promise<Response>(() => {})
    }))
    renderAt('/teams/1')
    expect(await screen.findByRole('heading', { name: 'Milestones' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByText('No milestones yet.')).not.toBeInTheDocument()
  })

  it('TEST-UI-04 milestone part (AC-02-10): Retry fetches the list again after an error', async () => {
    let attempts = 0
    fakeApi({
      'GET /api/auth/me': ok({ user: student }),
      'GET /api/teams/1': ok({ team }),
      'GET /api/teams/1/milestones': () => ++attempts === 1
        ? fail(500, 'INTERNAL_ERROR', 'Unexpected server error.')()
        : ok({ items: [milestone] })(),
    })
    renderAt('/teams/1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Unexpected server error.')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Proposal')).toBeInTheDocument()
    expect(attempts).toBe(2)
  })

  it('TEST-UI-01 (AC-04-6): server field errors appear under inputs without clearing typed values', async () => {
    let sent: Record<string, unknown> | undefined
    fakeApi({
      'GET /api/auth/me': ok({ user: supervisor }),
      // The page loads the team before showing the form (Issue #60).
      'GET /api/teams/1': ok({ team }),
      'POST /api/teams/1/milestones': (init) => {
        sent = JSON.parse(String(init?.body))
        return { status: 400, body: { error: {
          code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.',
          fields: { title: 'Title must be 3–120 characters.' },
        } } }
      },
    })
    renderAt('/teams/1/milestones/new')
    await userEvent.type(await screen.findByLabelText('Title'), 'ab')
    await userEvent.type(screen.getByLabelText('Description'), 'Draft')
    fireEvent.change(screen.getByLabelText('Deadline (Bangkok time)'), { target: { value: '2026-12-01T15:00' } })
    await userEvent.click(screen.getByRole('button', { name: 'Create milestone' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Please correct the highlighted fields.')
    expect(screen.getByText('Title must be 3–120 characters.')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('ab')
    expect(screen.getByLabelText('Description')).toHaveValue('Draft')
    expect(sent?.deadline).toBe('2026-12-01T08:00:00.000Z')
  })
})
