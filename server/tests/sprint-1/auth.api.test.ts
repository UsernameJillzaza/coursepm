import { createHash } from 'node:crypto'
import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { verifyPassword } from '../../src/auth/password'
import { cleanupUsers, createUser, demoAccount, DEMO_PASSWORD, loginAgent, sessionCookie, type TestUser } from '../helpers/users'

// F-01 Authentication and session: STS TEST-01-01 … TEST-01-05, TEST-01-07 … TEST-01-13.
let a1: TestUser // Student A1 (demo account, created by the shared account helper)

const sha256 = (token: string) => createHash('sha256').update(token).digest('hex')
const tokenOf = (cookie: string) => cookie.split(';')[0].split('=')[1]

async function loginCookie(user: TestUser) {
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password })
  const raw = sessionCookie(res.headers['set-cookie'])!
  return { res, raw, cookie: raw.split(';')[0] }
}

beforeAll(async () => {
  a1 = await demoAccount('alpha1')
})
afterAll(async () => {
  await cleanupUsers()
  await prisma.$disconnect()
})

describe('POST /api/auth/login', () => {
  it('TEST-01-01 (AC-01-1): valid credentials → 200, public user, HttpOnly cpm_session cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: a1.email, password: a1.password })
    expect(res.status).toBe(200)
    expect(res.body.user).toEqual({ id: a1.id, name: a1.name, email: a1.email, role: 'STUDENT' })
    const cookie = sessionCookie(res.headers['set-cookie'])
    expect(cookie).toBeDefined()
    expect(cookie).toMatch(/HttpOnly/i)
  })

  it('accepts the e-mail in a different case with spaces around it', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: `  ${a1.email.toUpperCase()} `, password: a1.password })
    expect(res.status).toBe(200)
  })

  it('TEST-01-02 (AC-01-2): wrong password → 401 INVALID_CREDENTIALS, no cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: a1.email, password: 'wrong-pass-9' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
    expect(sessionCookie(res.headers['set-cookie'])).toBeUndefined()
  })

  it('TEST-01-03 (AC-01-2): unknown e-mail → the same 401 body; empty body → 400 naming both fields', async () => {
    const wrongPw = await request(app).post('/api/auth/login').send({ email: a1.email, password: 'wrong-pass-9' })
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@test.local', password: 'whatever-1' })
    expect(unknown.status).toBe(401)
    expect(unknown.body).toEqual(wrongPw.body)
    const empty = await request(app).post('/api/auth/login').send({})
    expect(empty.status).toBe(400)
    expect(empty.body.error.code).toBe('VALIDATION_ERROR')
    expect(Object.keys(empty.body.error.fields).sort()).toEqual(['email', 'password'])
  })

  it('TEST-01-08 (AC-01-6): a "role" sent by the client is ignored', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: a1.email, password: a1.password, role: 'SUPERVISOR' })
    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('STUDENT')
  })
})

describe('GET /api/auth/me and POST /api/auth/logout', () => {
  it('TEST-01-04 (AC-01-3): returns { user } for a valid session', async () => {
    const res = await (await loginAgent(a1)).get('/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ user: { id: a1.id, name: a1.name, email: a1.email, role: 'STUDENT' } })
  })

  it('a malformed session cookie is treated as no session (401 on /me, 200 on /health), never a 500', async () => {
    for (const bad of ['cpm_session=%', 'cpm_session=%E0%A4%A', `cpm_session=${'z'.repeat(64)}`]) {
      expect((await request(app).get('/api/auth/me').set('Cookie', bad)).status).toBe(401)
      expect((await request(app).get('/api/health').set('Cookie', bad)).status).toBe(200)
    }
  })

  it('returns 401 UNAUTHENTICATED without a cookie', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: { code: 'UNAUTHENTICATED', message: expect.any(String) } })
  })

  it('TEST-01-05 (AC-01-4): logout deletes the session; the old cookie is then rejected', async () => {
    const { cookie } = await loginCookie(a1)
    const id = sha256(tokenOf(cookie))
    expect(await prisma.session.count({ where: { id } })).toBe(1)
    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie)
    expect(out.status).toBe(204)
    expect(await prisma.session.count({ where: { id } })).toBe(0)
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401)
  })

  it('TEST-01-11 (AC-01-9): logout without a session → 204 with no body', async () => {
    const res = await request(app).post('/api/auth/logout')
    expect(res.status).toBe(204)
    expect(res.text).toBe('')
  })

  it('TEST-01-09 (AC-01-7): an expired session → 401 and the row is deleted', async () => {
    const { cookie } = await loginCookie(a1)
    const id = sha256(tokenOf(cookie))
    await prisma.session.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401)
    expect(await prisma.session.count({ where: { id } })).toBe(0)
  })
})

describe('TEST-01-10 (AC-01-8): inactive accounts', () => {
  it('an inactive account cannot log in: the same generic 401 INVALID_CREDENTIALS', async () => {
    const inactive = await createUser('STUDENT', { isActive: false })
    const wrongPw = await request(app).post('/api/auth/login').send({ email: a1.email, password: 'wrong-pass-9' })
    const res = await request(app).post('/api/auth/login').send({ email: inactive.email, password: inactive.password })
    expect(res.status).toBe(401)
    expect(res.body).toEqual(wrongPw.body)
  })

  it('a session saved before deactivation gets 401 UNAUTHENTICATED on its next request', async () => {
    const user = await createUser('STUDENT')
    const agent = await loginAgent(user)
    expect((await agent.get('/api/auth/me')).status).toBe(200)
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } })
    const after = await agent.get('/api/auth/me')
    expect(after.status).toBe(401)
    expect(after.body.error.code).toBe('UNAUTHENTICATED')
  })
})

describe('TEST-01-07 / TEST-01-12 (AC-01-5): password storage', () => {
  it('TEST-01-07: login and /me bodies contain no password or hash', async () => {
    const { res: login, cookie } = await loginCookie(a1)
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie)
    for (const body of [login.text, me.text]) {
      expect(body).not.toMatch(/password/i)
      expect(body).not.toContain('scrypt$')
    }
  })

  it('TEST-01-12: A1\'s stored passwordHash is a scrypt hash that verifies, never the plaintext', async () => {
    const row = await prisma.user.findUniqueOrThrow({ where: { id: a1.id } })
    expect(row.passwordHash.startsWith('scrypt$16384$8$1$')).toBe(true)
    expect(row.passwordHash).not.toContain(DEMO_PASSWORD)
    expect(await verifyPassword(DEMO_PASSWORD, row.passwordHash)).toBe(true)
  })
})

describe('TEST-01-13 (AC-01-11): session storage and cookie attributes', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('stores SHA-256(token), not the token; expires 8 h after creation; cookie HttpOnly, SameSite=Lax, Path=/', async () => {
    vi.stubEnv('SESSION_TTL_HOURS', '8') // the STS precondition, independent of the local .env
    const { raw } = await loginCookie(a1)
    expect(raw).toMatch(/;\s*HttpOnly/i)
    expect(raw).toMatch(/;\s*SameSite=Lax/i)
    expect(raw).toMatch(/;\s*Path=\/(;|$)/i)
    expect(raw).not.toMatch(/;\s*Secure/i) // not in development/test

    const token = tokenOf(raw)
    expect(await prisma.session.count({ where: { id: token } })).toBe(0) // the raw token is never stored
    const row = await prisma.session.findUniqueOrThrow({ where: { id: sha256(token) } })
    // Both timestamps are written by the API from one clock reading, so the
    // difference is exactly the TTL (no database-clock or time-zone skew).
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(8 * 60 * 60 * 1000)
  })

  it('adds Secure to the cookie when NODE_ENV=production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { raw } = await loginCookie(a1)
    expect(raw).toMatch(/;\s*Secure/i)
  })
})
