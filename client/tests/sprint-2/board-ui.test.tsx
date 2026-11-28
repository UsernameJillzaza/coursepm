import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from '../../src/App'
import { BOARD_COLUMNS, BOARD_LABELS } from '../../src/board/types'
import { fail, fakeApi, ok, type Route } from '../helpers/fakeApi'

// F-10 board page (contract docs/sprints/sprint-2/F-10-progress-board.md,
// AC-10-8): STS TEST-UI-10. The 375 px no-horizontal-scroll check needs a real
// layout engine, so it is also asserted in the E2E (TEST-10-08); here the
// stacking classes are checked.
const student = { id: 3, name: 'Alpha Student 1', email: 'alpha1@coursepm.test', role: 'STUDENT' }
const supervisor = { id: 1, name: 'Dr. Supervisor One', email: 'supervisor1@coursepm.test', role: 'SUPERVISOR' }
const team = { id: 1, name: 'Team Alpha' }
// 10 Dec 18:00 and 12 Dec 18:00 Bangkok time.
const D10 = '2026-12-10T11:00:00.000Z'
const D12 = '2026-12-12T11:00:00.000Z'
const latest = (over: Record<string, unknown> = {}) => ({
  revision: 1, submittedAt: '2026-11-28T11:00:00.000Z', submittedBy: { id: 3, name: 'Alpha Student 1' }, hasFeedback: false, ...over,
})
const item = (id: number, state: string, over: Record<string, unknown> = {}) => ({
  milestoneId: id, title: `Milestone ${state}`, deadline: D10, originalDeadline: D10, extended: false, closedAt: null,
  state, revisionsUsed: 0, maxRevisions: 3, latest: null, ...over,
})
// One item per state, delivered out of display order.
const items = [
  item(15, 'CLOSED', { closedAt: '2026-11-27T11:00:00.000Z', revisionsUsed: 1, latest: latest({ hasFeedback: true }) }),
  item(14, 'OVERDUE'),
  item(13, 'FEEDBACK_GIVEN', { revisionsUsed: 1, latest: latest({ hasFeedback: true }) }),
  item(12, 'SUBMITTED', { revisionsUsed: 2, latest: latest({ revision: 2, submittedBy: { id: 4, name: 'Alpha Student 2' } }) }),
  item(11, 'NOT_SUBMITTED', { deadline: D12, extended: true }),
]
const counts = { NOT_SUBMITTED: 1, SUBMITTED: 1, FEEDBACK_GIVEN: 1, OVERDUE: 1, CLOSED: 1 }
const zero = { NOT_SUBMITTED: 0, SUBMITTED: 0, FEEDBACK_GIVEN: 0, OVERDUE: 0, CLOSED: 0 }
const board = (over: Record<string, unknown> = {}) => ({ team, generatedAt: '2026-11-28T12:00:00.000Z', counts, items, ...over })

function Where() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Where />
    </MemoryRouter>,
  )
}
function boardApi(routes: Record<string, Route>, user: object = student) {
  return fakeApi({ 'GET /api/auth/me': ok({ user }), ...routes })
}
const columns = () => screen.getAllByRole('region').filter((r) => r.hasAttribute('data-state'))
const location = () => screen.getByTestId('location').textContent

afterEach(() => vi.unstubAllGlobals())

describe('TEST-UI-10 (AC-10-8): board page', () => {
  it('shows the team name and five columns in BOARD_COLUMNS order with counts, whatever the item order', async () => {
    boardApi({ 'GET /api/teams/1/board': ok(board()) })
    renderAt('/teams/1/board')
    expect(await screen.findByRole('heading', { level: 1, name: 'Team Alpha' })).toBeInTheDocument()
    expect(columns().map((c) => c.getAttribute('aria-label'))).toEqual(BOARD_COLUMNS.map((s) => BOARD_LABELS[s]))
    expect(columns().map((c) => c.getAttribute('aria-label'))).toEqual(['Not submitted', 'Submitted', 'Feedback given', 'Overdue', 'Closed'])
    for (const c of columns()) {
      expect(within(c).getByTestId('count')).toHaveTextContent('1')
      const [card] = within(c).getAllByRole('listitem')
      expect(within(card).getByRole('link').getAttribute('href')).toMatch(/^\/milestones\/1[1-5]$/)
    }
  })

  it('cards link to /milestones/:id and show deadline, extension, revisions, latest revision and the feedback mark', async () => {
    boardApi({ 'GET /api/teams/1/board': ok(board()) })
    renderAt('/teams/1/board')
    const notSubmitted = await screen.findByRole('region', { name: 'Not submitted' })
    expect(within(notSubmitted).getByRole('link', { name: 'Milestone NOT_SUBMITTED' })).toHaveAttribute('href', '/milestones/11')
    expect(within(notSubmitted).getByText('Deadline 12 Dec 2026 18:00 (extended from 10 Dec 2026 18:00)')).toBeInTheDocument()
    expect(within(notSubmitted).getByText('0 / 3 revisions')).toBeInTheDocument()
    expect(within(notSubmitted).getByText('No revision yet')).toBeInTheDocument()

    const submitted = screen.getByRole('region', { name: 'Submitted' })
    expect(within(submitted).getByText('2 / 3 revisions')).toBeInTheDocument()
    expect(within(submitted).getByText('Revision 2 by Alpha Student 2, 28 Nov 2026 18:00')).toBeInTheDocument()
    expect(within(submitted).queryByText('Feedback given')).not.toBeInTheDocument()
    expect(within(submitted).getByText('Deadline 10 Dec 2026 18:00')).toBeInTheDocument()

    const reviewed = screen.getByRole('region', { name: 'Feedback given' })
    expect(within(within(reviewed).getByRole('listitem')).getByText('Feedback given')).toBeInTheDocument()
    const closed = screen.getByRole('region', { name: 'Closed' })
    expect(within(within(closed).getByRole('listitem')).getByText('Feedback given')).toBeInTheDocument()
  })

  it('has no write controls: no form, text box or action button, for a supervisor too', async () => {
    boardApi({ 'GET /api/teams/1/board': ok(board()) }, supervisor)
    renderAt('/teams/1/board')
    await screen.findByRole('region', { name: 'Overdue' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(document.querySelector('main form')).toBeNull()
    const buttons = within(screen.getByRole('main')).getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual(['Not submitted', 'Submitted', 'Feedback given', 'Overdue', 'Closed'])
    for (const name of ['New milestone', 'Submit', 'Edit', 'Grant extension', 'Close milestone', 'Save feedback']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument()
    }
  })

  it('clicking a column title sets ?state= and shows only that column; Show all clears it', async () => {
    const calls = boardApi({
      'GET /api/teams/1/board': ok(board()),
      'GET /api/teams/1/board?state=OVERDUE': ok(board({ items: [items[1]] })),
    })
    renderAt('/teams/1/board')
    await userEvent.click(await screen.findByRole('button', { name: 'Overdue' }))
    expect(location()).toBe('/teams/1/board?state=OVERDUE')
    expect(await screen.findByRole('button', { name: 'Show all' })).toBeInTheDocument()
    expect(columns().map((c) => c.getAttribute('aria-label'))).toEqual(['Overdue'])
    expect(within(columns()[0]).getByRole('link', { name: 'Milestone OVERDUE' })).toBeInTheDocument()
    expect(calls).toContain('GET /api/teams/1/board?state=OVERDUE')

    await userEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(location()).toBe('/teams/1/board')
    await screen.findByRole('region', { name: 'Closed' })
    expect(columns()).toHaveLength(5)
    expect(screen.queryByRole('button', { name: 'Show all' })).not.toBeInTheDocument()
  })

  it('the filter in the URL survives a reload; an unknown ?state is ignored', async () => {
    boardApi({
      'GET /api/teams/1/board?state=OVERDUE': ok(board({ items: [items[1]] })),
      'GET /api/teams/1/board': ok(board()),
    })
    const view = renderAt('/teams/1/board?state=OVERDUE')
    expect(await screen.findByRole('region', { name: 'Overdue' })).toBeInTheDocument()
    expect(columns()).toHaveLength(1)
    view.unmount()
    renderAt('/teams/1/board?state=DONE')
    expect(await screen.findByRole('region', { name: 'Closed' })).toBeInTheDocument()
    expect(columns()).toHaveLength(5)
  })

  it('shows the shared spinner while the board is pending', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) =>
      url === '/api/auth/me'
        ? Promise.resolve(new Response(JSON.stringify({ user: student }), { status: 200 }))
        : new Promise<Response>(() => {})))
    renderAt('/teams/1/board')
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Overdue' })).not.toBeInTheDocument()
  })

  it('an empty team shows "No milestones yet."; a filtered state with no card shows "No milestones are …"', async () => {
    boardApi({
      'GET /api/teams/1/board': ok(board({ items: [], counts: zero })),
      'GET /api/teams/1/board?state=CLOSED': ok(board({ items: [], counts: { ...counts, CLOSED: 0 } })),
    })
    const view = renderAt('/teams/1/board')
    expect(await screen.findByText('No milestones yet.')).toBeInTheDocument()
    view.unmount()
    renderAt('/teams/1/board?state=CLOSED')
    expect(await screen.findByText('No milestones are closed.')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Closed' })).getByTestId('count')).toHaveTextContent('0')
  })

  it('an error shows the alert with Retry, and Retry requests the board again', async () => {
    let n = 0
    const calls = boardApi({
      'GET /api/teams/1/board': () => (++n === 1 ? fail(500, 'INTERNAL_ERROR', 'Unexpected server error.')() : ok(board())()),
    })
    renderAt('/teams/1/board')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Unexpected server error.')
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('region', { name: 'Overdue' })).toBeInTheDocument()
    expect(calls.filter((c) => c === 'GET /api/teams/1/board')).toHaveLength(2)
  })

  it('out of scope (404) shows the TeamDetailPage heading, text and Back to My teams link', async () => {
    boardApi({ 'GET /api/teams/9/board': fail(404, 'NOT_FOUND', 'Team not found.') })
    renderAt('/teams/9/board')
    expect(await screen.findByRole('heading', { name: 'Team not found' })).toBeInTheDocument()
    expect(screen.getByText("It doesn't exist, or you aren't a member or supervisor of it.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to My teams' })).toHaveAttribute('href', '/teams')
  })

  it('at phone width the columns stack: one per row below lg, no fixed widths', async () => {
    boardApi({ 'GET /api/teams/1/board': ok(board()) })
    renderAt('/teams/1/board')
    await screen.findByRole('region', { name: 'Overdue' })
    const grid = columns()[0].parentElement!
    expect(grid).toHaveClass('row', 'row-cols-1', 'row-cols-lg-5')
    for (const c of columns()) expect(c.getAttribute('style')).toBeNull()
  })

  it('the team page has a Progress board link to /teams/:id/board', async () => {
    boardApi({
      'GET /api/teams/1': ok({ team: { ...team, courseCode: 'CPE334-DEMO', members: [], supervisors: [] } }),
      'GET /api/teams/1/milestones': ok({ items: [] }),
    })
    renderAt('/teams/1')
    expect(await screen.findByRole('link', { name: 'Progress board' })).toHaveAttribute('href', '/teams/1/board')
  })
})
