import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'
import { fail, fakeApi, ok } from '../helpers/fakeApi'

// F-08 UI (contract docs/sprints/sprint-2/F-08-milestone-maintenance.md,
// AC-08-12): STS TEST-UI-08.
const student = { id: 3, name: 'Alpha Student 1', email: 'alpha1@coursepm.test', role: 'STUDENT' }
const supervisor = { id: 1, name: 'Dr. Supervisor One', email: 'supervisor1@coursepm.test', role: 'SUPERVISOR' }
const team = { id: 1, name: 'Team Alpha' }
const sup = { id: 1, name: 'Dr. Supervisor One' }
// 10 Dec 18:00 and 12 Dec 18:00 Bangkok time.
const D10 = '2026-12-10T11:00:00.000Z'
const D12 = '2026-12-12T11:00:00.000Z'
const milestone = (over: Record<string, unknown> = {}) => ({
  id: 10,
  teamId: 1,
  title: 'Proposal',
  description: 'Original text',
  deadline: D10,
  maxRevisions: 3,
  createdById: 1,
  createdAt: '2026-11-15T03:00:00.000Z',
  status: 'OPEN',
  revisionsUsed: 0,
  latestSubmittedAt: null,
  closedAt: null,
  originalDeadline: D10,
  extended: false,
  ...over,
})
const extended = { deadline: D12, originalDeadline: D10, extended: true }
const closedEarly = { closedAt: '2026-11-28T11:00:00.000Z', status: 'CLOSED' }
const closeItem = { kind: 'CLOSE', field: null, oldValue: null, newValue: null, reason: 'Course ended', by: sup, at: '2026-11-28T11:00:00.000Z' }
const extensionItem = { kind: 'EXTENSION', field: 'deadline', oldValue: D10, newValue: D12, reason: 'Server outage', by: sup, at: '2026-11-27T11:00:00.000Z' }

function pageApi(user: object, m: object, history: object[] = [], extra: Parameters<typeof fakeApi>[0] = {}) {
  return fakeApi({
    'GET /api/auth/me': ok({ user }),
    'GET /api/milestones/10': ok({ milestone: m, team }),
    'GET /api/milestones/10/submissions': ok({ items: [] }),
    'GET /api/milestones/10/history': ok({ items: history }),
    ...extra,
  })
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

const button = (name: string) => screen.queryByRole('button', { name })

afterEach(() => vi.unstubAllGlobals())

describe('TEST-UI-08 (AC-08-12): which controls are shown', () => {
  it('a supervisor inside the edit window sees Edit, Grant extension and Close milestone', async () => {
    pageApi(supervisor, milestone())
    renderAt('/milestones/10')
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(button('Grant extension')).toBeInTheDocument()
    expect(button('Close milestone')).toBeInTheDocument()
    expect(await screen.findByText('No changes since the milestone was created.')).toBeInTheDocument()
  })

  it('Edit is hidden outside the edit window (a submission, an extension, a passed deadline)', async () => {
    for (const over of [{ revisionsUsed: 1 }, extended, { status: 'CLOSED' }]) {
      const view = (pageApi(supervisor, milestone(over)), renderAt('/milestones/10'))
      expect(await screen.findByRole('button', { name: 'Grant extension' })).toBeInTheDocument()
      expect(button('Close milestone')).toBeInTheDocument()
      expect(button('Edit')).not.toBeInTheDocument()
      view.unmount()
      vi.unstubAllGlobals()
    }
  })

  it('after an early close no control is shown, and the header names who closed it and when', async () => {
    pageApi(supervisor, milestone(closedEarly), [closeItem])
    renderAt('/milestones/10')
    expect(await screen.findByText('Closed early by Dr. Supervisor One on 28 Nov 18:00')).toBeInTheDocument()
    for (const name of ['Edit', 'Grant extension', 'Close milestone']) expect(button(name)).not.toBeInTheDocument()
  })

  it('a student sees no controls, but sees the Closed early and Extended badges, the extended deadline and the history', async () => {
    pageApi(student, milestone({ ...extended, ...closedEarly }), [closeItem, extensionItem])
    renderAt('/milestones/10')
    expect(await screen.findByText('Deadline 12 Dec 18:00 (extended from 10 Dec 18:00)')).toBeInTheDocument()
    const header = screen.getByRole('heading', { level: 1 }).parentElement!
    expect(within(header).getByText('Closed early')).toBeInTheDocument()
    expect(within(header).getByText('Extended')).toBeInTheDocument()
    for (const name of ['Edit', 'Grant extension', 'Close milestone']) expect(button(name)).not.toBeInTheDocument()
    const history = await screen.findByRole('region', { name: 'History' })
    expect(within(history).getAllByRole('listitem')).toHaveLength(2)
    expect(within(history).getByText(/Server outage/)).toBeInTheDocument()
  })

  it('the team list shows the Closed early and Extended badges', async () => {
    fakeApi({
      'GET /api/auth/me': ok({ user: student }),
      'GET /api/teams/1': ok({ team: { ...team, courseCode: 'CPE334-DEMO', members: [], supervisors: [] } }),
      'GET /api/teams/1/milestones': ok({ items: [milestone({ ...extended, ...closedEarly })] }),
    })
    renderAt('/teams/1')
    const item = (await screen.findByRole('link', { name: 'Proposal' })).closest('li')!
    expect(within(item).getByText('Closed early')).toBeInTheDocument()
    expect(within(item).getByText('Extended')).toBeInTheDocument()
  })
})

describe('TEST-UI-08 (AC-08-12): forms and errors', () => {
  it('an edit 400 shows each message under its field and keeps the typed values', async () => {
    pageApi(supervisor, milestone(), [], {
      'PATCH /api/milestones/10': () => ({
        status: 400,
        body: { error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fields: { description: 'Description must not contain control characters.', deadline: 'Deadline must be a valid future date.' } } },
      }),
    })
    renderAt('/milestones/10')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const description = screen.getByLabelText('Description')
    expect(description).toHaveValue('Original text')
    expect(screen.getByLabelText(/^Deadline/)).toHaveValue('2026-12-10T18:00')
    await userEvent.clear(description)
    await userEvent.type(description, 'Typed text')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Description must not contain control characters.')).toBeInTheDocument()
    expect(screen.getByText('Deadline must be a valid future date.')).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toHaveValue('Typed text')
  })

  it('an unchanged edit sends the stored values and shows NO_CHANGE in the alert; a 409 also goes to the alert', async () => {
    let body: unknown
    let answer = fail(400, 'NO_CHANGE', 'Nothing to change.')
    pageApi(supervisor, milestone(), [], {
      'PATCH /api/milestones/10': (init) => {
        body = JSON.parse(String(init?.body))
        return answer()
      },
    })
    renderAt('/milestones/10')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing to change.')
    expect(body).toEqual({ description: 'Original text', deadline: D10 })

    answer = fail(409, 'MILESTONE_HAS_SUBMISSIONS', 'This milestone already has a submission; grant an extension instead.')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This milestone already has a submission; grant an extension instead.')
  })

  it('an extension 400 shows each message under its field and keeps the typed values; a 409 shows the alert', async () => {
    let answer: () => { status: number; body?: unknown } = () => ({
      status: 400,
      body: { error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fields: { newDeadline: 'New deadline must be later than the current deadline.', reason: 'Reason must be 3–500 characters.' } } },
    })
    let body: unknown
    pageApi(supervisor, milestone(), [], {
      'POST /api/milestones/10/extensions': (init) => {
        body = JSON.parse(String(init?.body))
        return answer()
      },
    })
    renderAt('/milestones/10')
    await userEvent.click(await screen.findByRole('button', { name: 'Grant extension' }))
    expect(screen.getByText(/Current deadline: 10 Dec 18:00/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/^New deadline/), '2026-12-12T18:00')
    await userEvent.type(screen.getByLabelText('Reason'), 'ab')
    await userEvent.click(screen.getByRole('button', { name: 'Save extension' }))
    expect(await screen.findByText('New deadline must be later than the current deadline.')).toBeInTheDocument()
    expect(screen.getByText('Reason must be 3–500 characters.')).toBeInTheDocument()
    expect(screen.getByLabelText('Reason')).toHaveValue('ab')
    expect(screen.getByLabelText(/^New deadline/)).toHaveValue('2026-12-12T18:00')
    expect(body).toEqual({ newDeadline: D12, reason: 'ab' })

    answer = fail(409, 'MILESTONE_CLOSED', 'This milestone has been closed by the supervisor.')
    await userEvent.click(screen.getByRole('button', { name: 'Save extension' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This milestone has been closed by the supervisor.')
  })

  it('Close asks for confirmation; Cancel sends nothing; confirming sends the optional reason', async () => {
    let body: unknown
    const calls = pageApi(supervisor, milestone(), [], {
      'POST /api/milestones/10/close': (init) => {
        body = JSON.parse(String(init?.body))
        return { status: 200, body: { milestone: milestone(closedEarly) } }
      },
    })
    renderAt('/milestones/10')
    await userEvent.click(await screen.findByRole('button', { name: 'Close milestone' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Students can no longer submit to this milestone. This cannot be undone.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls.filter((c) => c.startsWith('POST'))).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: 'Close milestone' }))
    const again = screen.getByRole('dialog')
    await userEvent.type(within(again).getByLabelText(/Reason/), 'Course ended')
    await userEvent.click(within(again).getByRole('button', { name: 'Close milestone' }))
    await vi.waitFor(() => expect(calls).toContain('POST /api/milestones/10/close'))
    expect(body).toEqual({ reason: 'Course ended' })
  })
})
