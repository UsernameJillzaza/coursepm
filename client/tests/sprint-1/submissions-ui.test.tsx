import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'
import { fail, fakeApi, ok } from '../helpers/fakeApi'

// F-05 UI: the milestone page with the submit form and the revision list.
// STS TEST-UI-02 (AC-05-8), TEST-UI-07 (AC-05-10), the submission-list part
// of TEST-UI-04 (AC-02-10), plus AC-05-1 / AC-05-7 behaviour. CHG-01 (#74):
// the milestone carries awaitingFeedback, and the form waits for feedback
// (TEST-UI-02, AC-05-13).
const student = { id: 3, name: 'Alpha Student 1', email: 'alpha1@coursepm.test', role: 'STUDENT' }
const supervisor = { id: 1, name: 'Dr. Supervisor One', email: 'supervisor1@coursepm.test', role: 'SUPERVISOR' }
const team = { id: 1, name: 'Team Alpha' }
const milestone = (over: Record<string, unknown> = {}) => ({
  id: 10,
  teamId: 1,
  title: 'Proposal',
  description: '',
  deadline: '2026-11-22T16:59:00.000Z',
  maxRevisions: 3,
  createdById: 1,
  createdAt: '2026-11-15T03:00:00.000Z',
  status: 'OPEN',
  revisionsUsed: 0,
  latestSubmittedAt: null,
  awaitingFeedback: false,
  ...over,
})
const submission = (revision: number, title: string) => ({
  id: 100 + revision,
  revision,
  title,
  description: '',
  link: `https://example.com/r${revision}`,
  submittedAt: '2026-11-16T05:00:00.000Z',
  submittedBy: { id: 3, name: 'Alpha Student 1' },
  feedback: null,
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('F-05 milestone page: revisions', () => {
  it('AC-05-7: lists revisions newest first with submitter and link; a supervisor gets no submit form', async () => {
    fakeApi({
      'GET /api/auth/me': ok({ user: supervisor }),
      'GET /api/milestones/10': ok({ milestone: milestone({ revisionsUsed: 2 }), team }),
      'GET /api/milestones/10/submissions': ok({ items: [submission(2, 'Second try'), submission(1, 'First try')] }),
    })
    renderAt('/milestones/10')
    const cards = await screen.findAllByRole('article')
    expect(within(cards[0]).getByText(/Revision 2/)).toBeInTheDocument()
    expect(within(cards[0]).getByText('Second try')).toBeInTheDocument()
    expect(within(cards[1]).getByText(/Revision 1/)).toBeInTheDocument()
    expect(within(cards[0]).getByRole('link', { name: 'https://example.com/r2' })).toHaveAttribute('href', 'https://example.com/r2')
    expect(screen.getByText(/Revisions used: 2 \/ 3/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit work/i })).not.toBeInTheDocument()
  })

  it('the milestone list on the team page links each title to its milestone page', async () => {
    fakeApi({
      'GET /api/auth/me': ok({ user: student }),
      'GET /api/teams/1': ok({ team: { ...team, courseCode: 'CPE334-DEMO', members: [], supervisors: [] } }),
      'GET /api/teams/1/milestones': ok({ items: [milestone()] }),
    })
    renderAt('/teams/1')
    expect(await screen.findByRole('link', { name: 'Proposal' })).toHaveAttribute('href', '/milestones/10')
  })
})

describe('F-05 submit form', () => {
  it('AC-05-1: a student submits; the new revision appears and the counter updates', async () => {
    let submitted = false
    fakeApi({
      'GET /api/auth/me': ok({ user: student }),
      'GET /api/milestones/10': () => ok({ milestone: milestone({ revisionsUsed: submitted ? 1 : 0, awaitingFeedback: submitted }), team })(),
      'GET /api/milestones/10/submissions': () => ok({ items: submitted ? [submission(1, 'Our proposal')] : [] })(),
      'POST /api/milestones/10/submissions': (init) => {
        expect(JSON.parse(String(init?.body))).toEqual({ title: 'Our proposal', description: 'Draft', link: 'https://example.com/r1' })
        submitted = true
        return { status: 201, body: { submission: submission(1, 'Our proposal') } }
      },
    })
    renderAt('/milestones/10')
    expect(await screen.findByText('No submissions yet.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Title'), 'Our proposal')
    await userEvent.type(screen.getByLabelText('Description'), 'Draft')
    await userEvent.type(screen.getByLabelText(/link/i), 'https://example.com/r1')
    await userEvent.click(screen.getByRole('button', { name: /submit work/i }))
    expect(await screen.findByText('Our proposal')).toBeInTheDocument()
    expect(await screen.findByText(/Revisions used: 1 \/ 3/)).toBeInTheDocument()
    // CHG-01: the new revision has no feedback yet, so the form waits.
    expect(await screen.findByText('Waiting for feedback on revision 1.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit work/i })).not.toBeInTheDocument()
  })

  it('TEST-UI-02 (AC-05-8): after the deadline the form is replaced by an explanation', async () => {
    fakeApi({
      'GET /api/auth/me': ok({ user: student }),
      'GET /api/milestones/10': ok({ milestone: milestone({ status: 'CLOSED' }), team }),
      'GET /api/milestones/10/submissions': ok({ items: [] }),
    })
    renderAt('/milestones/10')
    expect(await screen.findByText('The deadline has passed. Submissions are closed.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit work/i })).not.toBeInTheDocument()
  })

  it('TEST-UI-02 (AC-05-8): at the revision limit the form is replaced by an explanation', async () => {
    fakeApi({
      'GET /api/auth/me': ok({ user: student }),
      'GET /api/milestones/10': ok({ milestone: milestone({ revisionsUsed: 3 }), team }),
      'GET /api/milestones/10/submissions': ok({ items: [submission(3, 'c'), submission(2, 'b'), submission(1, 'a')] }),
    })
    renderAt('/milestones/10')
    expect(await screen.findByText('All 3 revisions used.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit work/i })).not.toBeInTheDocument()
  })

  it('TEST-UI-02 (AC-05-8, AC-05-13): while the latest revision awaits feedback the form is replaced by an explanation', async () => {
    fakeApi({
      'GET /api/auth/me': ok({ user: student }),
      'GET /api/milestones/10': ok({ milestone: milestone({ revisionsUsed: 2, awaitingFeedback: true }), team }),
      'GET /api/milestones/10/submissions': ok({ items: [submission(2, 'b'), submission(1, 'a')] }),
    })
    renderAt('/milestones/10')
    expect(await screen.findByText('Waiting for feedback on revision 2.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit work/i })).not.toBeInTheDocument()
  })

  it('TEST-UI-02 (AC-05-8): a 409 from the server (state changed meanwhile) shows its message', async () => {
    fakeApi({
      'GET /api/auth/me': ok({ user: student }),
      'GET /api/milestones/10': ok({ milestone: milestone(), team }),
      'GET /api/milestones/10/submissions': ok({ items: [] }),
      'POST /api/milestones/10/submissions': fail(409, 'DEADLINE_PASSED', 'The deadline for this milestone has passed.'),
    })
    renderAt('/milestones/10')
    await userEvent.type(await screen.findByLabelText('Title'), 'Late work')
    await userEvent.type(screen.getByLabelText(/link/i), 'https://example.com/late')
    await userEvent.click(screen.getByRole('button', { name: /submit work/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The deadline for this milestone has passed.')
  })

  it('TEST-UI-07 (AC-05-10): a 400 shows the message beside Link and keeps the entered values', async () => {
    fakeApi({
      'GET /api/auth/me': ok({ user: student }),
      'GET /api/milestones/10': ok({ milestone: milestone(), team }),
      'GET /api/milestones/10/submissions': ok({ items: [] }),
      'POST /api/milestones/10/submissions': () => ({
        status: 400,
        body: { error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fields: { link: 'Link must be a full http:// or https:// address.' } } },
      }),
    })
    renderAt('/milestones/10')
    await userEvent.type(await screen.findByLabelText('Title'), 'Design doc')
    await userEvent.type(screen.getByLabelText(/link/i), 'javascript:alert(1)')
    await userEvent.click(screen.getByRole('button', { name: /submit work/i }))
    expect(await screen.findByText('Link must be a full http:// or https:// address.')).toBeInTheDocument()
    expect(screen.getByLabelText(/link/i)).toHaveClass('is-invalid')
    expect(screen.getByLabelText(/link/i)).toHaveValue('javascript:alert(1)')
    expect(screen.getByLabelText('Title')).toHaveValue('Design doc')
  })
})

describe('TEST-UI-04 submission part (AC-02-10): revision list states', () => {
  it('shows a loading state while the revisions are pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/auth/me') return Promise.resolve(new Response(JSON.stringify({ user: student }), { status: 200 }))
        if (url === '/api/milestones/10') return Promise.resolve(new Response(JSON.stringify({ milestone: milestone(), team }), { status: 200 }))
        return new Promise<Response>(() => {})
      }),
    )
    renderAt('/milestones/10')
    expect(await screen.findByRole('heading', { name: 'Proposal' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
    expect(screen.queryByText('No submissions yet.')).not.toBeInTheDocument()
  })

  it('shows the empty state when there are no revisions', async () => {
    fakeApi({
      'GET /api/auth/me': ok({ user: supervisor }),
      'GET /api/milestones/10': ok({ milestone: milestone(), team }),
      'GET /api/milestones/10/submissions': ok({ items: [] }),
    })
    renderAt('/milestones/10')
    expect(await screen.findByText('No submissions yet.')).toBeInTheDocument()
  })

  it('shows an error with Retry, and Retry loads the revisions again', async () => {
    let attempt = 0
    fakeApi({
      'GET /api/auth/me': ok({ user: supervisor }),
      'GET /api/milestones/10': ok({ milestone: milestone(), team }),
      'GET /api/milestones/10/submissions': () =>
        ++attempt === 1 ? fail(500, 'INTERNAL_ERROR', 'Unexpected server error.')() : ok({ items: [submission(1, 'First try')] })(),
    })
    renderAt('/milestones/10')
    expect(await screen.findByRole('alert')).toHaveTextContent('Unexpected server error.')
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByText('First try')).toBeInTheDocument()
  })

  it('a milestone outside the user\'s scope shows "Milestone not found"', async () => {
    fakeApi({ 'GET /api/auth/me': ok({ user: student }), 'GET /api/milestones/99': fail(404, 'NOT_FOUND', 'Milestone not found.') })
    renderAt('/milestones/99')
    expect(await screen.findByRole('heading', { name: 'Milestone not found' })).toBeInTheDocument()
  })
})
