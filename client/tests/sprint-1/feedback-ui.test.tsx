import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'
import { fakeApi, ok } from '../helpers/fakeApi'

const supervisor = { id: 1, name: 'Dr. Supervisor One', email: 'supervisor1@coursepm.test', role: 'SUPERVISOR' }
const student = { id: 3, name: 'Alpha Student 1', email: 'alpha1@coursepm.test', role: 'STUDENT' }
const team = { id: 1, name: 'Team Alpha' }
const milestone = {
  id: 10, teamId: 1, title: 'Proposal', description: '', deadline: '2026-11-22T16:59:00.000Z',
  maxRevisions: 3, createdById: 1, createdAt: '2026-11-15T03:00:00.000Z',
  status: 'OPEN', revisionsUsed: 2, latestSubmittedAt: '2026-11-16T05:00:00.000Z',
}
const revision = (number: number, feedback: unknown = null) => ({
  id: 100 + number, revision: number, title: `Proposal v${number}`, description: '',
  link: `https://example.com/v${number}`, submittedAt: '2026-11-16T05:00:00.000Z',
  submittedBy: { id: student.id, name: student.name }, feedback,
})
const savedFeedback = {
  id: 9, submissionId: 101, body: 'Please clarify the scope.',
  createdAt: '2026-11-16T09:00:00.000Z', supervisor: { id: supervisor.id, name: supervisor.name },
}

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

afterEach(() => vi.unstubAllGlobals())

describe('F-06 feedback UI', () => {
  it('shows the feedback on its own revision and keeps revision 2 empty for a student', async () => {
    fakeApi({
      'GET /api/auth/me': ok({ user: student }),
      'GET /api/milestones/10': ok({ milestone, team }),
      'GET /api/milestones/10/submissions': ok({ items: [revision(2), revision(1, savedFeedback)] }),
    })
    renderAt('/milestones/10')
    const first = await screen.findByRole('article', { name: 'Revision 1' })
    const second = screen.getByRole('article', { name: 'Revision 2' })
    expect(within(first).getByText(savedFeedback.body)).toBeInTheDocument()
    expect(within(first).getByText(supervisor.name, { exact: false })).toBeInTheDocument()
    expect(within(second).getByText('No feedback yet')).toBeInTheDocument()
    expect(within(second).queryByText(savedFeedback.body)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save feedback' })).not.toBeInTheDocument()
  })

  it('TEST-UI-06 (AC-06-6): a 400 field error stays beside the textarea and preserves the text', async () => {
    fakeApi({
      'GET /api/auth/me': ok({ user: supervisor }),
      'GET /api/milestones/10': ok({ milestone, team }),
      'GET /api/milestones/10/submissions': ok({ items: [revision(1)] }),
      'POST /api/submissions/101/feedback': () => ({ status: 400, body: { error: {
        code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.',
        fields: { body: 'Feedback must be 1–4,000 characters.' },
      } } }),
    })
    renderAt('/milestones/10')
    const textarea = await screen.findByRole('textbox', { name: 'Feedback for revision 1' })
    await userEvent.type(textarea, 'Draft feedback')
    await userEvent.click(screen.getByRole('button', { name: 'Save feedback' }))
    expect(await screen.findByText('Feedback must be 1–4,000 characters.')).toBeInTheDocument()
    expect(textarea).toHaveValue('Draft feedback')
  })

  it('saving feedback refreshes the revision list and replaces the form with the saved feedback', async () => {
    let saved = false
    let listCalls = 0
    fakeApi({
      'GET /api/auth/me': ok({ user: supervisor }),
      'GET /api/milestones/10': ok({ milestone, team }),
      'GET /api/milestones/10/submissions': () => {
        listCalls++
        return ok({ items: [revision(1, saved ? savedFeedback : null)] })()
      },
      'POST /api/submissions/101/feedback': (init) => {
        expect(JSON.parse(String(init?.body))).toEqual({ body: savedFeedback.body })
        saved = true
        return { status: 201, body: { feedback: savedFeedback } }
      },
    })
    renderAt('/milestones/10')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Feedback for revision 1' }), savedFeedback.body)
    await userEvent.click(screen.getByRole('button', { name: 'Save feedback' }))
    expect(await screen.findByText(savedFeedback.body)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save feedback' })).not.toBeInTheDocument()
    expect(listCalls).toBe(2)
  })
})
