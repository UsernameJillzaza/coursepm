import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'
import { fail, fakeApi, ok, type Route } from '../helpers/fakeApi'

// F-09 Course administration UI. Sprint 2 STS TEST-UI-09 (AC-09-11):
// the /admin page (Teams and Accounts with loading / empty / error states, the
// New team form, the add selects, Deactivate with confirmation), RequireRole +
// NoAccess for other roles, the top bar and the post-login redirect.

const adminUser = { id: 9, name: 'Course Admin', email: 'admin@coursepm.test', role: 'ADMIN' }
const student = { id: 3, name: 'Alpha Student 1', email: 'alpha1@coursepm.test', role: 'STUDENT' }
const supervisor = { id: 1, name: 'Dr. Supervisor One', email: 'supervisor1@coursepm.test', role: 'SUPERVISOR' }

const users = [
  { ...adminUser, isActive: true },
  { ...supervisor, isActive: true },
  { id: 2, name: 'Dr. Supervisor Two', email: 'supervisor2@coursepm.test', role: 'SUPERVISOR', isActive: true },
  { ...student, isActive: true },
  { id: 4, name: 'Alpha Student 2', email: 'alpha2@coursepm.test', role: 'STUDENT', isActive: true },
  { id: 5, name: 'Old Student', email: 'old@coursepm.test', role: 'STUDENT', isActive: false },
]
const alpha = {
  id: 1,
  courseCode: 'CPE334-DEMO',
  name: 'Team Alpha',
  members: [{ id: 3, name: 'Alpha Student 1' }],
  supervisors: [{ id: 1, name: 'Dr. Supervisor One' }],
}

const me = (user: unknown): Route => ok({ user })
const activeUsers = ok({ items: users.filter((u) => u.isActive) })

function adminRoutes(overrides: Record<string, Route> = {}) {
  return {
    'GET /api/auth/me': me(adminUser),
    'GET /api/admin/teams': ok({ items: [alpha] }),
    'GET /api/admin/users': ok({ items: users }),
    'GET /api/admin/users?active=true': activeUsers,
    ...overrides,
  }
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

const teamsSection = () => screen.getByRole('region', { name: 'Teams' })
const accountsSection = () => screen.getByRole('region', { name: 'Accounts' })

afterEach(() => vi.unstubAllGlobals())

describe('TEST-UI-09 (AC-09-11): routing, top bar and NoAccess', () => {
  it('an admin who logs in is sent to /admin and sees both sections', async () => {
    fakeApi({
      ...adminRoutes(),
      'GET /api/auth/me': fail(401, 'UNAUTHENTICATED', 'Please log in.'),
      'GET /api/health': ok({ status: 'ok' }),
      'POST /api/auth/login': ok({ user: adminUser }),
    })
    renderAt('/login')
    await userEvent.type(await screen.findByLabelText(/e-mail/i), adminUser.email)
    await userEvent.type(screen.getByLabelText(/password/i), 'any-password')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))
    expect(await screen.findByRole('heading', { name: 'Course administration' })).toBeInTheDocument()
    expect(teamsSection()).toBeInTheDocument()
    expect(accountsSection()).toBeInTheDocument()
  })

  it('the top bar shows the Admin role and an Admin link, and no My teams link', async () => {
    fakeApi(adminRoutes())
    renderAt('/admin')
    const nav = await screen.findByRole('navigation')
    expect(within(nav).getByText('Admin', { selector: '.badge' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
    expect(within(nav).queryByRole('link', { name: /my teams/i })).not.toBeInTheDocument()
  })

  it('an admin opening an unknown path is sent to /admin', async () => {
    fakeApi(adminRoutes())
    renderAt('/somewhere')
    expect(await screen.findByRole('heading', { name: 'Course administration' })).toBeInTheDocument()
  })

  it.each([
    ['student', student],
    ['supervisor', supervisor],
  ])('a %s who opens /admin sees NoAccess, no admin data is requested, and there is no Admin link', async (_label, user) => {
    const calls = fakeApi({ 'GET /api/auth/me': me(user), 'GET /api/teams': ok({ items: [] }) })
    renderAt('/admin')
    expect(await screen.findByText("You don't have access to this page.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my teams/i })).toHaveAttribute('href', '/teams')
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
    expect(calls.filter((c) => c.includes('/api/admin'))).toEqual([])
  })
})

describe('TEST-UI-09 (AC-09-11): Teams section', () => {
  it('shows a loading state while the team list is pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/auth/me'
          ? Promise.resolve(new Response(JSON.stringify({ user: adminUser }), { status: 200 }))
          : new Promise<Response>(() => {}),
      ),
    )
    renderAt('/admin')
    await screen.findByRole('heading', { name: 'Course administration' })
    expect(within(teamsSection()).getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    fakeApi(adminRoutes({ 'GET /api/admin/teams': ok({ items: [] }) }))
    renderAt('/admin')
    expect(await within(await screen.findByRole('region', { name: 'Teams' })).findByText('No teams yet.')).toBeInTheDocument()
  })

  it('shows the error state with Retry, which loads again', async () => {
    let attempts = 0
    fakeApi(
      adminRoutes({
        'GET /api/admin/teams': () => (++attempts === 1 ? { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' } } } : { status: 200, body: { items: [alpha] } }),
      }),
    )
    renderAt('/admin')
    const section = await screen.findByRole('region', { name: 'Teams' })
    expect(await within(section).findByRole('alert')).toHaveTextContent('Unexpected server error.')
    await userEvent.click(within(section).getByRole('button', { name: 'Retry' }))
    expect(await within(section).findByText('Team Alpha')).toBeInTheDocument()
  })

  it('lists teams with course code, members and supervisors', async () => {
    fakeApi(adminRoutes())
    renderAt('/admin')
    const row = (await within(await screen.findByRole('region', { name: 'Teams' })).findByText('Team Alpha')).closest('tr')!
    expect(row).toHaveTextContent('CPE334-DEMO')
    expect(row).toHaveTextContent('Alpha Student 1')
    expect(row).toHaveTextContent('Dr. Supervisor One')
  })

  it('New team: field errors under the inputs, values kept; 409 in the alert', async () => {
    let call = 0
    fakeApi(
      adminRoutes({
        'POST /api/admin/teams': () =>
          ++call === 1
            ? { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fields: { courseCode: 'Course code must be 2–20 letters, digits or hyphens.', name: 'Team name must be 2–80 characters.' } } } }
            : { status: 409, body: { error: { code: 'TEAM_EXISTS', message: 'A team with this course code and name already exists.' } } },
      }),
    )
    renderAt('/admin')
    const section = await screen.findByRole('region', { name: 'Teams' })
    await userEvent.type(within(section).getByLabelText('Course code'), 'C')
    await userEvent.type(within(section).getByLabelText('Team name'), 'T')
    await userEvent.click(within(section).getByRole('button', { name: 'Create team' }))
    expect(await within(section).findByText('Course code must be 2–20 letters, digits or hyphens.')).toBeInTheDocument()
    expect(within(section).getByText('Team name must be 2–80 characters.')).toBeInTheDocument()
    expect(within(section).getByLabelText('Course code')).toHaveValue('C')
    expect(within(section).getByLabelText('Team name')).toHaveValue('T')
    expect(within(section).getByLabelText('Course code')).toHaveClass('is-invalid')

    await userEvent.click(within(section).getByRole('button', { name: 'Create team' }))
    expect(await within(section).findByRole('alert')).toHaveTextContent('A team with this course code and name already exists.')
  })

  it('New team: a 201 adds the team to the table and clears the form', async () => {
    const delta = { id: 7, courseCode: 'CPE334-DEMO', name: 'Team Delta', members: [], supervisors: [] }
    const calls = fakeApi(adminRoutes({ 'POST /api/admin/teams': () => ({ status: 201, body: { team: delta } }) }))
    renderAt('/admin')
    const section = await screen.findByRole('region', { name: 'Teams' })
    await userEvent.type(within(section).getByLabelText('Course code'), 'CPE334-DEMO')
    await userEvent.type(within(section).getByLabelText('Team name'), 'Team Delta')
    await userEvent.click(within(section).getByRole('button', { name: 'Create team' }))
    expect(await within(section).findByText('Team Delta')).toBeInTheDocument()
    expect(within(section).getByLabelText('Team name')).toHaveValue('')
    expect(calls).toContain('POST /api/admin/teams')
  })

  it('Add member lists only active students not already in the team; Add is disabled until one is chosen', async () => {
    const updated = { ...alpha, members: [...alpha.members, { id: 4, name: 'Alpha Student 2' }] }
    let sent: unknown
    fakeApi(
      adminRoutes({
        'POST /api/admin/teams/1/members': (init) => {
          sent = JSON.parse(String(init?.body))
          return { status: 201, body: { team: updated } }
        },
      }),
    )
    renderAt('/admin')
    const row = (await within(await screen.findByRole('region', { name: 'Teams' })).findByText('Team Alpha')).closest('tr')!
    const select = within(row).getByLabelText('Add member to Team Alpha')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    // Alpha Student 1 is already a member; Old Student is inactive; supervisors and the admin are not students.
    expect(options).toEqual(['Choose a student…', 'Alpha Student 2'])
    const add = within(row).getByRole('button', { name: 'Add member' })
    expect(add).toBeDisabled()
    await userEvent.selectOptions(select, '4')
    expect(add).toBeEnabled()
    await userEvent.click(add)
    expect(sent).toEqual({ userId: 4 })
    // The members cell now lists both; the chosen student is no longer offered.
    expect(await within(row).findByText('Alpha Student 1, Alpha Student 2')).toBeInTheDocument()
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a student…'])
  })

  it('Add supervisor lists only active supervisors not already assigned, and shows a 400 from the API', async () => {
    fakeApi(
      adminRoutes({
        'POST /api/admin/teams/1/supervisors': fail(400, 'VALIDATION_ERROR', 'Only an active supervisor can be assigned to supervise a team.'),
      }),
    )
    renderAt('/admin')
    const row = (await within(await screen.findByRole('region', { name: 'Teams' })).findByText('Team Alpha')).closest('tr')!
    const select = within(row).getByLabelText('Add supervisor to Team Alpha')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a supervisor…', 'Dr. Supervisor Two'])
    await userEvent.selectOptions(select, '2')
    await userEvent.click(within(row).getByRole('button', { name: 'Add supervisor' }))
    expect(await within(teamsSection()).findByRole('alert')).toHaveTextContent('Only an active supervisor can be assigned to supervise a team.')
  })
})

describe('TEST-UI-09 (AC-09-11): Accounts section', () => {
  it('shows each account with role and status; Deactivate only on active student and supervisor rows', async () => {
    fakeApi(adminRoutes())
    renderAt('/admin')
    const section = await screen.findByRole('region', { name: 'Accounts' })
    const rowOf = async (name: string) => (await within(section).findByText(name)).closest('tr')!
    expect(within(await rowOf('Course Admin')).queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument()
    const old = await rowOf('Old Student')
    expect(within(old).getByText('Inactive')).toBeInTheDocument()
    expect(within(old).queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument()
    expect(within(await rowOf('Alpha Student 2')).getByRole('button', { name: 'Deactivate Alpha Student 2' })).toBeInTheDocument()
    expect(within(await rowOf('Dr. Supervisor Two')).getByRole('button', { name: 'Deactivate Dr. Supervisor Two' })).toBeInTheDocument()
  })

  it('Deactivate asks for confirmation; Cancel sends nothing', async () => {
    const calls = fakeApi(adminRoutes())
    renderAt('/admin')
    const section = await screen.findByRole('region', { name: 'Accounts' })
    await userEvent.click(await within(section).findByRole('button', { name: 'Deactivate Alpha Student 2' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Deactivate Alpha Student 2? They will be signed out and cannot sign in again. Their past work is kept.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls.filter((c) => c.startsWith('POST'))).toEqual([])
  })

  it('confirming sends the deactivate request and marks the account Inactive', async () => {
    const calls = fakeApi(
      adminRoutes({
        'POST /api/admin/users/4/deactivate': ok({ user: { ...users[4], isActive: false } }),
      }),
    )
    renderAt('/admin')
    const section = await screen.findByRole('region', { name: 'Accounts' })
    await userEvent.click(await within(section).findByRole('button', { name: 'Deactivate Alpha Student 2' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }))
    const row = (await within(section).findByText('Alpha Student 2')).closest('tr')!
    expect(await within(row).findByText('Inactive')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument()
    expect(calls).toContain('POST /api/admin/users/4/deactivate')
  })

  it('a 409 from deactivate is shown in the alert', async () => {
    fakeApi(adminRoutes({ 'POST /api/admin/users/4/deactivate': fail(409, 'ALREADY_INACTIVE', 'This account is already inactive.') }))
    renderAt('/admin')
    const section = await screen.findByRole('region', { name: 'Accounts' })
    await userEvent.click(await within(section).findByRole('button', { name: 'Deactivate Alpha Student 2' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }))
    expect(await within(section).findByRole('alert')).toHaveTextContent('This account is already inactive.')
  })

  it('the role filter requests the filtered list', async () => {
    const calls = fakeApi(adminRoutes({ 'GET /api/admin/users?role=SUPERVISOR': ok({ items: users.filter((u) => u.role === 'SUPERVISOR') }) }))
    renderAt('/admin')
    const section = await screen.findByRole('region', { name: 'Accounts' })
    await within(section).findByText('Old Student')
    await userEvent.selectOptions(within(section).getByLabelText('Role'), 'SUPERVISOR')
    expect(await within(section).findByText('Dr. Supervisor Two')).toBeInTheDocument()
    expect(within(section).queryByText('Old Student')).not.toBeInTheDocument()
    expect(calls).toContain('GET /api/admin/users?role=SUPERVISOR')
  })

  it('shows the empty and error states', async () => {
    fakeApi(adminRoutes({ 'GET /api/admin/users': ok({ items: [] }) }))
    const view = renderAt('/admin')
    expect(await within(await screen.findByRole('region', { name: 'Accounts' })).findByText('No accounts.')).toBeInTheDocument()
    view.unmount()
    vi.unstubAllGlobals()
    fakeApi(adminRoutes({ 'GET /api/admin/users': fail(500, 'INTERNAL_ERROR', 'Unexpected server error.') }))
    renderAt('/admin')
    expect(await within(await screen.findByRole('region', { name: 'Accounts' })).findByRole('alert')).toHaveTextContent('Unexpected server error.')
  })
})
