import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'

// F-01 UI (AC-01-1, AC-01-2, AC-01-4, AC-01-10): login form, protected routes, logout.
// fetch is replaced by a small fake API, so these tests need no server.
type Route = (init?: RequestInit) => { status: number; body?: unknown }

function fakeApi(routes: Record<string, Route>) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url}`
      calls.push(key)
      const route = routes[key]
      const { status, body } = route ? route(init) : { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found.' } } }
      return new Response(body === undefined ? null : JSON.stringify(body), { status })
    }),
  )
  return calls
}

const student = { id: 3, name: 'Alpha Student 1', email: 'alpha1@coursepm.test', role: 'STUDENT' }
const unauthenticated = () => ({ status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Please log in.' } } })

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('F-01 authentication UI', () => {
  it('redirects a visitor without a session from /teams to the login page', async () => {
    fakeApi({ 'GET /api/auth/me': unauthenticated, 'GET /api/health': () => ({ status: 200, body: { status: 'ok' } }) })
    renderAt('/teams')
    expect(await screen.findByRole('heading', { name: /log in/i })).toBeInTheDocument()
  })

  it('AC-01-2: shows the server message for wrong credentials and keeps the e-mail', async () => {
    fakeApi({
      'GET /api/auth/me': unauthenticated,
      'GET /api/health': () => ({ status: 200, body: { status: 'ok' } }),
      'POST /api/auth/login': () => ({
        status: 401,
        body: { error: { code: 'INVALID_CREDENTIALS', message: 'E-mail or password is incorrect.' } },
      }),
    })
    renderAt('/login')
    await userEvent.type(await screen.findByLabelText(/e-mail/i), 'alpha1@coursepm.test')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-pass')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail or password is incorrect.')
    expect(screen.getByLabelText(/e-mail/i)).toHaveValue('alpha1@coursepm.test')
  })

  it('AC-01-1: a successful login opens /teams and shows the user name and role', async () => {
    let loggedIn = false
    fakeApi({
      'GET /api/auth/me': () => (loggedIn ? { status: 200, body: { user: student } } : unauthenticated()),
      'GET /api/health': () => ({ status: 200, body: { status: 'ok' } }),
      'POST /api/auth/login': (init) => {
        expect(JSON.parse(String(init?.body))).toEqual({ email: 'alpha1@coursepm.test', password: 'right-pass-1' })
        loggedIn = true
        return { status: 200, body: { user: student } }
      },
      'GET /api/teams': () => ({ status: 200, body: { items: [] } }),
    })
    renderAt('/login')
    await userEvent.type(await screen.findByLabelText(/e-mail/i), 'alpha1@coursepm.test')
    await userEvent.type(screen.getByLabelText(/password/i), 'right-pass-1')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))
    expect(await screen.findByText('Alpha Student 1')).toBeInTheDocument()
    expect(screen.getByText(/student/i, { selector: '.badge' })).toBeInTheDocument()
  })

  it('AC-01-4: Log out calls the API and returns to the login page', async () => {
    let loggedIn = true
    const calls = fakeApi({
      'GET /api/auth/me': () => (loggedIn ? { status: 200, body: { user: student } } : unauthenticated()),
      'GET /api/health': () => ({ status: 200, body: { status: 'ok' } }),
      'POST /api/auth/logout': () => {
        loggedIn = false
        return { status: 204 }
      },
      'GET /api/teams': () => ({ status: 200, body: { items: [] } }),
    })
    renderAt('/teams')
    await userEvent.click(await screen.findByRole('button', { name: /log out/i }))
    expect(await screen.findByRole('heading', { name: /log in/i })).toBeInTheDocument()
    expect(calls).toContain('POST /api/auth/logout')
  })

})

describe('TEST-UI-05 (AC-01-10): login form errors', () => {
  const health = () => ({ status: 200, body: { status: 'ok', service: 'CoursePM API' } })

  it('a missing field shows a message beside that field and keeps what was typed', async () => {
    fakeApi({
      'GET /api/auth/me': unauthenticated,
      'GET /api/health': health,
      'POST /api/auth/login': () => ({
        status: 400,
        body: { error: { code: 'VALIDATION_ERROR', message: 'Check the highlighted fields.', fields: { password: 'Password is required.' } } },
      }),
    })
    renderAt('/login')
    await userEvent.type(await screen.findByLabelText(/e-mail/i), 'alpha1@coursepm.test')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))
    expect(await screen.findByText('Password is required.')).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toHaveClass('is-invalid')
    expect(screen.getByLabelText(/e-mail/i)).not.toHaveClass('is-invalid')
    expect(screen.getByLabelText(/e-mail/i)).toHaveValue('alpha1@coursepm.test')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('invalid credentials show one generic alert, mark no field, and keep the typed values', async () => {
    fakeApi({
      'GET /api/auth/me': unauthenticated,
      'GET /api/health': health,
      'POST /api/auth/login': () => ({
        status: 401,
        body: { error: { code: 'INVALID_CREDENTIALS', message: 'E-mail or password is incorrect.' } },
      }),
    })
    renderAt('/login')
    await userEvent.type(await screen.findByLabelText(/e-mail/i), 'alpha1@coursepm.test')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-pass')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail or password is incorrect.')
    expect(screen.getByLabelText(/e-mail/i)).not.toHaveClass('is-invalid')
    expect(screen.getByLabelText(/password/i)).not.toHaveClass('is-invalid')
    expect(screen.getByLabelText(/e-mail/i)).toHaveValue('alpha1@coursepm.test')
    expect(screen.getByLabelText(/password/i)).toHaveValue('wrong-pass')
  })
})
