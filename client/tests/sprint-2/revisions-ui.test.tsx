import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom'
import App from '../../src/App'
import { fail, fakeApi, ok, type Route } from '../helpers/fakeApi'

// F-07 Revision history and comparison UI. Sprint 2 STS TEST-UI-07H
// (AC-07-7, AC-07-8): the /milestones/:id/revisions page, its list states,
// two-checkbox selection, the side-by-side comparison kept in the URL, and the
// 400 / 404 cases. Also the "Compare revisions" link on the milestone page.

const student = { id: 3, name: 'Alpha Student 1', email: 'alpha1@coursepm.test', role: 'STUDENT' }
const milestone = {
  id: 10, teamId: 1, title: 'SRS', description: '', deadline: '2026-12-20T16:59:00.000Z', maxRevisions: 3,
  createdById: 1, createdAt: '2026-11-20T00:00:00.000Z', revisionsUsed: 3, status: 'OPEN', latestSubmittedAt: null,
  awaitingFeedback: true, // CHG-01 (#74): revision 3 has no feedback yet
}
const detail = { milestone, team: { id: 1, name: 'Team Alpha' } }
const sup = { id: 1, name: 'Dr. Supervisor One' }
const rev = (n: number, extra: Record<string, unknown> = {}) => ({
  id: 100 + n, revision: n, title: `SRS v${n}`, description: `Text ${n}`, link: `https://example.com/v${n}`,
  submittedAt: `2026-11-2${n}T03:00:00.000Z`, submittedBy: { id: 3, name: 'Alpha Student 1' }, feedback: null, ...extra,
})
const three = [rev(3), rev(2), rev(1, { feedback: { id: 7, submissionId: 101, body: 'Add the use cases.', createdAt: '2026-11-21T05:00:00.000Z', supervisor: sup } })]
const comparison = {
  milestoneId: 10,
  older: { ...three[2], title: 'SRS', description: 'Draft of the SRS' },
  newer: { ...three[0], title: 'SRS', description: 'Final draft of the SRS v2' },
  changes: {
    title: { changed: false },
    link: { changed: true },
    description: {
      changed: true,
      parts: [
        { op: 'removed', text: 'Draft' },
        { op: 'added', text: 'Final draft' },
        { op: 'same', text: ' of the SRS' },
        { op: 'added', text: ' v2' },
      ],
    },
  },
}

function routes(items: unknown[], overrides: Record<string, Route> = {}) {
  return {
    'GET /api/auth/me': ok({ user: student }),
    'GET /api/milestones/10': ok(detail),
    'GET /api/milestones/10/submissions': ok({ items }),
    'GET /api/milestones/10/compare?a=1&b=3': ok({ comparison }),
    ...overrides,
  }
}

let currentUrl = ''
let navigate: NavigateFunction = () => undefined
function LocationSpy() {
  const location = useLocation()
  navigate = useNavigate()
  currentUrl = location.pathname + location.search
  return null
}

function renderAt(path: string | string[]) {
  const entries = Array.isArray(path) ? path : [path]
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <App />
      <LocationSpy />
    </MemoryRouter>,
  )
}

const box = (n: number) => screen.getByRole('checkbox', { name: `Select revision ${n}` })
const compareButton = () => screen.getByRole('button', { name: 'Compare' })

afterEach(() => vi.unstubAllGlobals())

describe('TEST-UI-07H (AC-07-7, AC-07-8): the revisions page', () => {
  it('the milestone page links to Compare revisions', async () => {
    fakeApi(routes(three))
    renderAt('/milestones/10')
    expect(await screen.findByRole('link', { name: 'Compare revisions' })).toHaveAttribute('href', '/milestones/10/revisions')
  })

  it('shows the breadcrumb, the milestone title and deadline, and every revision newest first with its details', async () => {
    fakeApi(routes(three))
    renderAt('/milestones/10/revisions')
    expect(await screen.findByRole('heading', { name: /Compare revisions/ })).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Team Alpha' })).toHaveAttribute('href', '/teams/1')
    expect(within(crumbs).getByRole('link', { name: 'SRS' })).toHaveAttribute('href', '/milestones/10')
    expect(screen.getByText(/Deadline: 20 Dec 2026 23:59/)).toBeInTheDocument()
    const rows = await screen.findAllByRole('checkbox')
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Select revision 3', 'Select revision 2', 'Select revision 1'])
    const row1 = box(1).closest('tr')!
    expect(row1).toHaveTextContent('SRS v1')
    expect(row1).toHaveTextContent('Alpha Student 1')
    expect(row1).toHaveTextContent('21 Nov 2026 10:00')
    expect(row1).toHaveTextContent('Feedback given')
    expect(box(3).closest('tr')!).toHaveTextContent('No feedback yet')
  })

  it('shows a loading state while the list is pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/auth/me'
          ? Promise.resolve(new Response(JSON.stringify({ user: student }), { status: 200 }))
          : url === '/api/milestones/10'
            ? Promise.resolve(new Response(JSON.stringify(detail), { status: 200 }))
            : new Promise<Response>(() => {}),
      ),
    )
    renderAt('/milestones/10/revisions')
    expect(await screen.findByRole('heading', { name: /Compare revisions/ })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })

  it('shows the error state with Retry', async () => {
    let attempts = 0
    fakeApi(routes([], {
      'GET /api/milestones/10/submissions': () => (++attempts === 1
        ? { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' } } }
        : { status: 200, body: { items: three } }),
    }))
    renderAt('/milestones/10/revisions')
    expect(await screen.findByRole('alert')).toHaveTextContent('Unexpected server error.')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('checkbox', { name: 'Select revision 3' })).toBeInTheDocument()
  })

  it('AC-07-7: no revision → "No revisions yet."', async () => {
    fakeApi(routes([]))
    renderAt('/milestones/10/revisions')
    expect(await screen.findByText('No revisions yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Compare' })).not.toBeInTheDocument()
  })

  it('AC-07-7: one revision → the list, the explanation, and Compare disabled', async () => {
    fakeApi(routes([rev(1)]))
    renderAt('/milestones/10/revisions')
    expect(await screen.findByText('Only one revision so far; compare needs two.')).toBeInTheDocument()
    expect(box(1)).toBeInTheDocument()
    expect(compareButton()).toBeDisabled()
  })

  it('Compare is disabled until exactly two are checked, and a third checkbox is then disabled', async () => {
    fakeApi(routes(three))
    renderAt('/milestones/10/revisions')
    await screen.findByRole('checkbox', { name: 'Select revision 3' })
    expect(compareButton()).toBeDisabled()
    await userEvent.click(box(3))
    expect(compareButton()).toBeDisabled()
    await userEvent.click(box(1))
    expect(compareButton()).toBeEnabled()
    expect(box(2)).toBeDisabled()
    await userEvent.click(box(1))
    expect(box(2)).toBeEnabled()
    expect(compareButton()).toBeDisabled()
  })

  it('checking 3 then 1 and pressing Compare puts the older on the left, with badges and marked words, and keeps ?a=1&b=3 in the URL', async () => {
    const calls = fakeApi(routes(three))
    renderAt('/milestones/10/revisions')
    await screen.findByRole('checkbox', { name: 'Select revision 3' })
    await userEvent.click(box(3))
    await userEvent.click(box(1))
    await userEvent.click(compareButton())

    const panel = await screen.findByRole('region', { name: 'Comparison' })
    const [left, right] = within(panel).getAllByRole('article')
    expect(left).toHaveAccessibleName('Revision 1 (older)')
    expect(right).toHaveAccessibleName('Revision 3 (newer)')
    expect(currentUrl).toBe('/milestones/10/revisions?a=1&b=3')
    expect(calls).toContain('GET /api/milestones/10/compare?a=1&b=3')

    // Field badges.
    expect(within(panel).getByTestId('badge-title')).toHaveTextContent('Unchanged')
    expect(within(panel).getByTestId('badge-link')).toHaveTextContent('Changed')
    expect(within(panel).getByTestId('badge-description')).toHaveTextContent('Changed')
    // Removed words struck through on the left, added words highlighted on the right.
    expect(within(left).getByText('Draft').tagName).toBe('DEL')
    expect(within(right).getByText('Final draft').tagName).toBe('INS')
    expect(within(right).getByText('v2', { exact: false }).tagName).toBe('INS')
    expect(within(left).queryByText('Final draft')).not.toBeInTheDocument()
    expect(within(right).queryByText('Draft')).not.toBeInTheDocument()
    // Each side: submitter, time, feedback or "No feedback yet", clickable link.
    expect(left).toHaveTextContent('Add the use cases.')
    expect(right).toHaveTextContent('No feedback yet')
    const link = within(right).getByRole('link', { name: 'https://example.com/v3' })
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('opening the URL with ?a=1&b=3 (a reload or a shared link) shows the same comparison and checks both boxes', async () => {
    fakeApi(routes(three))
    renderAt('/milestones/10/revisions?a=1&b=3')
    const panel = await screen.findByRole('region', { name: 'Comparison' })
    expect(within(panel).getAllByRole('article')[0]).toHaveAccessibleName('Revision 1 (older)')
    expect(box(1)).toBeChecked()
    expect(box(3)).toBeChecked()
  })

  it('stacks the two columns below 768 px: each column is full width on small screens and half from md up', async () => {
    fakeApi(routes(three))
    renderAt('/milestones/10/revisions?a=1&b=3')
    const panel = await screen.findByRole('region', { name: 'Comparison' })
    for (const column of within(panel).getAllByRole('article')) {
      expect(column.parentElement).toHaveClass('col-12', 'col-md-6')
    }
    // Long links and words wrap instead of widening the page.
    expect(within(panel).getAllByRole('article')[1].querySelector('.text-break')).not.toBeNull()
  })

  it('a hand-edited URL that the API rejects with 400 shows the message and keeps the list usable', async () => {
    fakeApi(routes(three, {
      'GET /api/milestones/10/compare?a=2&b=2': () => ({
        status: 400,
        body: { error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fields: { b: 'Choose two different revisions.' } } },
      }),
    }))
    renderAt('/milestones/10/revisions?a=2&b=2')
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose two different revisions to compare.')
    await userEvent.click(box(3))
    await userEvent.click(box(1))
    expect(compareButton()).toBeEnabled()
  })

  it('a revision number that is not in this milestone shows "Revision not found." with the list usable', async () => {
    fakeApi(routes(three, { 'GET /api/milestones/10/compare?a=1&b=9': fail(404, 'NOT_FOUND', 'Revision not found.') }))
    renderAt('/milestones/10/revisions?a=1&b=9')
    expect(await screen.findByRole('alert')).toHaveTextContent('Revision not found.')
    expect(box(3)).toBeEnabled()
  })

  it('a 404 for the milestone shows the "Milestone not found" page', async () => {
    fakeApi(routes([], {
      'GET /api/milestones/10': fail(404, 'NOT_FOUND', 'Milestone not found.'),
      'GET /api/milestones/10/submissions': fail(404, 'NOT_FOUND', 'Milestone not found.'),
    }))
    renderAt('/milestones/10/revisions')
    expect(await screen.findByRole('heading', { name: 'Milestone not found' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
  it('a URL with only one of a / b explains it and requests no comparison (PR #83 review)', async () => {
    const calls = fakeApi(routes(three))
    renderAt('/milestones/10/revisions?a=1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose two different revisions to compare.')
    expect(calls.filter((c) => c.includes('/compare'))).toEqual([])
    expect(box(3)).toBeEnabled()
  })

  it('going Back to the page without ?a=&b= clears the comparison and the selection (PR #83 review)', async () => {
    fakeApi(routes(three))
    renderAt(['/milestones/10/revisions', '/milestones/10/revisions?a=1&b=3'])
    await screen.findByRole('region', { name: 'Comparison' })
    expect(box(1)).toBeChecked()
    await act(async () => {
      await navigate(-1)
    })
    expect(currentUrl).toBe('/milestones/10/revisions')
    expect(screen.queryByRole('region', { name: 'Comparison' })).not.toBeInTheDocument()
    expect(box(1)).not.toBeChecked()
    expect(box(3)).not.toBeChecked()
    expect(compareButton()).toBeDisabled()
  })
})
