import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'
import { fakeApi, ok, type Route } from '../helpers/fakeApi'

// F-11 Score panel on the milestone page. Sprint 3 STS TEST-UI-11 (AC-11-10).

const student = { id: 3, name: 'Alpha Student 1', email: 'alpha1@coursepm.test', role: 'STUDENT' }
const supervisor = { id: 1, name: 'Dr. Supervisor One', email: 'supervisor1@coursepm.test', role: 'SUPERVISOR' }
const sup = { id: 1, name: 'Dr. Supervisor One' }
const team = { id: 1, name: 'Team Alpha' }
const milestone = {
  id: 10, teamId: 1, title: 'Proposal', description: '', deadline: '2026-12-10T11:00:00.000Z', maxRevisions: 3,
  createdById: 1, createdAt: '2026-11-15T03:00:00.000Z', status: 'OPEN', revisionsUsed: 0, latestSubmittedAt: null,
  awaitingFeedback: false, closedAt: null, originalDeadline: '2026-12-10T11:00:00.000Z', extended: false,
}
// 29 Nov 10:00 and 11:00 Bangkok time.
const T10 = '2026-11-29T03:00:00.000Z'
const T11 = '2026-11-29T04:00:00.000Z'
const unreleased = {
  value: 85, releasedAt: null, releasedBy: null,
  history: [{ kind: 'SET', oldValue: null, newValue: 85, reason: null, by: sup, at: T10 }],
}
const released = {
  value: 90, releasedAt: T10, releasedBy: sup,
  history: [
    { kind: 'SET', oldValue: 85, newValue: 90, reason: 'Regraded after appeal', by: sup, at: T11 },
    { kind: 'RELEASE', oldValue: null, newValue: null, reason: null, by: sup, at: T10 },
    { kind: 'SET', oldValue: null, newValue: 85, reason: null, by: sup, at: T10 },
  ],
}
const err = (status: number, code: string, message: string, fields?: Record<string, string>) => () => ({
  status, body: { error: { code, message, ...(fields ? { fields } : {}) } },
})

function pageApi(user: object, score: Route, extra: Record<string, Route> = {}) {
  return fakeApi({
    'GET /api/auth/me': ok({ user }),
    'GET /api/milestones/10': ok({ milestone, team }),
    'GET /api/milestones/10/submissions': ok({ items: [] }),
    'GET /api/milestones/10/history': ok({ items: [] }),
    'GET /api/milestones/10/score': score,
    ...extra,
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/milestones/10']}>
      <App />
    </MemoryRouter>,
  )
}

const panel = () => screen.findByRole('region', { name: 'Score' })

afterEach(() => vi.unstubAllGlobals())

describe('TEST-UI-11 (AC-11-10): supervisor', () => {
  it('no score yet: the input and Save, no Release button, "No score yet."', async () => {
    pageApi(supervisor, ok({ score: null }))
    renderPage()
    const p = await panel()
    expect(await within(p).findByText('No score yet.')).toBeInTheDocument()
    expect(within(p).getByLabelText('Score (0–100)')).toHaveValue(null)
    expect(within(p).getByRole('button', { name: 'Save score' })).toBeInTheDocument()
    expect(within(p).queryByRole('button', { name: 'Release score' })).not.toBeInTheDocument()
    expect(within(p).queryByLabelText(/Reason for change/)).not.toBeInTheDocument()
  })

  it('an invalid score shows the field error under the input and keeps the typed value', async () => {
    pageApi(supervisor, ok({ score: null }), {
      'PUT /api/milestones/10/score': err(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', { score: 'Score must be a whole number from 0 to 100.' }),
    })
    renderPage()
    const p = await panel()
    const input = await within(p).findByLabelText('Score (0–100)')
    await userEvent.type(input, '101')
    await userEvent.click(within(p).getByRole('button', { name: 'Save score' }))
    expect(await within(p).findByText('Score must be a whole number from 0 to 100.')).toBeInTheDocument()
    expect(input).toHaveValue(101)
    expect(input).toHaveClass('is-invalid')
  })

  it('NO_CHANGE and a 409 show in the alert', async () => {
    pageApi(supervisor, ok({ score: unreleased }), {
      'PUT /api/milestones/10/score': err(400, 'NO_CHANGE', 'The score already has this value.'),
      'POST /api/milestones/10/score/release': err(409, 'ALREADY_RELEASED', 'This score has already been released.'),
    })
    renderPage()
    const p = await panel()
    await within(p).findByText('Not released')
    await userEvent.click(within(p).getByRole('button', { name: 'Save score' }))
    expect(await within(p).findByRole('alert')).toHaveTextContent('The score already has this value.')
    await userEvent.click(within(p).getByRole('button', { name: 'Release score' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Release' }))
    expect(await within(p).findByText('This score has already been released.')).toBeInTheDocument()
  })

  it('saving shows the new value and history from the response', async () => {
    let sent: unknown
    pageApi(supervisor, ok({ score: null }), {
      'PUT /api/milestones/10/score': (init) => {
        sent = JSON.parse(String(init?.body))
        return { status: 200, body: { score: unreleased } }
      },
    })
    renderPage()
    const p = await panel()
    await userEvent.type(await within(p).findByLabelText('Score (0–100)'), '85')
    await userEvent.click(within(p).getByRole('button', { name: 'Save score' }))
    expect(sent).toEqual({ score: 85 })
    expect(await within(p).findByText('Not released')).toBeInTheDocument()
    expect(within(p).getByText(/— → 85 · Dr\. Supervisor One · 29 Nov 10:00/)).toBeInTheDocument()
  })

  it('Release is offered for an unreleased score; its dialog names the team, and Cancel sends nothing', async () => {
    const calls = pageApi(supervisor, ok({ score: unreleased }))
    renderPage()
    const p = await panel()
    await userEvent.click(await within(p).findByRole('button', { name: 'Release score' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Students of Team Alpha will see this score. After release, every change needs a reason.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls.filter((c) => c.startsWith('POST') || c.startsWith('PUT'))).toEqual([])
  })

  it('confirming Release shows the released state from the response', async () => {
    pageApi(supervisor, ok({ score: unreleased }), {
      'POST /api/milestones/10/score/release': ok({ score: { ...unreleased, releasedAt: T10, releasedBy: sup, history: [{ kind: 'RELEASE', oldValue: null, newValue: null, reason: null, by: sup, at: T10 }, ...unreleased.history] } }),
    })
    renderPage()
    const p = await panel()
    await userEvent.click(await within(p).findByRole('button', { name: 'Release score' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Release' }))
    expect(await within(p).findByText('Released 29 Nov 10:00 by Dr. Supervisor One')).toBeInTheDocument()
    expect(within(p).queryByRole('button', { name: 'Release score' })).not.toBeInTheDocument()
  })

  it('a released score: the required reason field, the status line, no Release button and the history lines', async () => {
    let sent: unknown
    pageApi(supervisor, ok({ score: released }), {
      'PUT /api/milestones/10/score': (init) => {
        sent = JSON.parse(String(init?.body))
        return { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fields: { reason: 'A reason (3–500 characters) is required to change a released score.' } } } }
      },
    })
    renderPage()
    const p = await panel()
    expect(await within(p).findByText('Released 29 Nov 10:00 by Dr. Supervisor One')).toBeInTheDocument()
    expect(within(p).queryByRole('button', { name: 'Release score' })).not.toBeInTheDocument()
    const reason = within(p).getByLabelText('Reason for change (required after release)')
    expect(reason).toBeRequired()
    const lines = within(within(p).getByRole('list', { name: 'Score history' })).getAllByRole('listitem').map((li) => li.textContent)
    expect(lines).toEqual([
      '85 → 90 · Regraded after appeal · Dr. Supervisor One · 29 Nov 11:00',
      'Released · Dr. Supervisor One · 29 Nov 10:00',
      '— → 85 · Dr. Supervisor One · 29 Nov 10:00',
    ])
    const input = within(p).getByLabelText('Score (0–100)')
    await userEvent.clear(input)
    await userEvent.type(input, '70')
    await userEvent.type(reason, 'ab')
    await userEvent.click(within(p).getByRole('button', { name: 'Save score' }))
    expect(sent).toEqual({ score: 70, reason: 'ab' })
    expect(await within(p).findByText('A reason (3–500 characters) is required to change a released score.')).toBeInTheDocument()
    expect(reason).toHaveValue('ab')
  })
})

describe('TEST-UI-11 (AC-11-10): student', () => {
  it('before release: only "Score not released yet." — no input, button or history', async () => {
    pageApi(student, ok({ score: null }))
    renderPage()
    const p = await panel()
    expect(await within(p).findByText('Score not released yet.')).toBeInTheDocument()
    expect(within(p).queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(within(p).queryByRole('button')).not.toBeInTheDocument()
    expect(within(p).queryByRole('list')).not.toBeInTheDocument()
  })

  it('after release: "Score: 90 / 100 (released 29 Nov 10:00)"', async () => {
    pageApi(student, ok({ score: { value: 90, releasedAt: T10 } }))
    renderPage()
    const p = await panel()
    expect(await within(p).findByText('Score: 90 / 100 (released 29 Nov 10:00)')).toBeInTheDocument()
    expect(within(p).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('TEST-UI-11 (AC-11-10): loading and error states', () => {
  it('a pending score load shows a spinner inside the panel', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const bodies: Record<string, unknown> = {
        '/api/auth/me': { user: supervisor },
        '/api/milestones/10': { milestone, team },
        '/api/milestones/10/submissions': { items: [] },
        '/api/milestones/10/history': { items: [] },
      }
      return url in bodies ? Promise.resolve(new Response(JSON.stringify(bodies[url]), { status: 200 })) : new Promise<Response>(() => {})
    }))
    renderPage()
    const p = await panel()
    // Its own text, not a second role="status" spinner (Sprint 1 TEST-UI-04 expects one).
    expect(within(p).getByText('Loading score…')).toHaveAttribute('aria-busy', 'true')
    expect(within(p).queryByRole('status')).not.toBeInTheDocument()
  })

  it('a failed load shows ErrorAlert with Retry inside the panel, the rest of the page stays, and Retry re-requests', async () => {
    let attempts = 0
    const calls = pageApi(supervisor, () => (++attempts === 1
      ? { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' } } }
      : { status: 200, body: { score: unreleased } }))
    renderPage()
    const p = await panel()
    expect(await within(p).findByRole('alert')).toHaveTextContent('Unexpected server error.')
    expect(screen.getByRole('heading', { name: 'Proposal' })).toBeInTheDocument()
    await userEvent.click(within(p).getByRole('button', { name: 'Retry' }))
    expect(await within(p).findByText('Not released')).toBeInTheDocument()
    expect(calls.filter((c) => c === 'GET /api/milestones/10/score')).toHaveLength(2)
  })
})
