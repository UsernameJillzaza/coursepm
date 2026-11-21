import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { cleanupUsers, demoAccount, sessionCookie, type TestUser } from '../helpers/users'

// Lab 6 regression tests for Issue #58 (partner UAT finding DEF-CP-02).
// A control character in the login e-mail (the partner sent a NUL byte) must
// be an ordinary credential failure: 401 INVALID_CREDENTIALS with the same
// body as a wrong password and no cookie (AC-01-2), never a 500 from the
// database rejecting the text.

// Built with fromCharCode so the source file itself contains no raw control bytes.
const NUL = String.fromCharCode(0)
const SOH = String.fromCharCode(1)
const US = String.fromCharCode(0x1f)
const DEL = String.fromCharCode(0x7f)

let a1: TestUser
let wrongPasswordBody: unknown

beforeAll(async () => {
  a1 = await demoAccount('alpha1')
  const res = await request(app).post('/api/auth/login').send({ email: a1.email, password: 'wrong-pass-9' })
  wrongPasswordBody = res.body
})
afterAll(async () => {
  await cleanupUsers()
  await prisma.$disconnect()
})

async function login(email: string, password: string) {
  return request(app).post('/api/auth/login').send({ email, password })
}

function expectInvalidCredentials(res: request.Response) {
  expect(res.status).toBe(401)
  expect(res.body).toEqual(wrongPasswordBody)
  expect(sessionCookie(res.headers['set-cookie'])).toBeUndefined()
}

describe('TEST-L6-58-01 (AC-01-2, FR-01): a NUL byte in the login e-mail is a 401, not a 500', () => {
  it('the partner\'s input: NUL inside a real account\'s e-mail, wrong password', async () => {
    const [local, domain] = a1.email.split('@')
    expectInvalidCredentials(await login(`${local}${NUL}@${domain}`, 'wrong'))
  })

  it('NUL inside a real account\'s e-mail with that account\'s correct password', async () => {
    const [local, domain] = a1.email.split('@')
    expectInvalidCredentials(await login(`${local}${NUL}@${domain}`, a1.password))
  })

  it('NUL at the end of the e-mail, where trimming does not remove it', async () => {
    expectInvalidCredentials(await login(`${a1.email}${NUL}`, a1.password))
  })
})

describe('TEST-L6-58-02 (AC-01-2): other control characters in the e-mail, and NUL in the password', () => {
  it.each([['SOH', SOH], ['US', US], ['DEL', DEL]])('%s inside the e-mail → 401', async (_name, ch) => {
    const [local, domain] = a1.email.split('@')
    expectInvalidCredentials(await login(`${local}${ch}@${domain}`, a1.password))
  })

  it('NUL in the password of a real account → 401', async () => {
    expectInvalidCredentials(await login(a1.email, `${a1.password}${NUL}`))
  })

  it('the real credentials still sign in after the rejected attempts', async () => {
    const res = await login(a1.email, a1.password)
    expect(res.status).toBe(200)
    expect(sessionCookie(res.headers['set-cookie'])).toBeDefined()
  })
})
