import express from 'express'
import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { errorHandler } from '../../src/app'
import { AppError } from '../../src/http'
import { DEMO_TEAMS, DEMO_USERS, seed } from '../../src/seed/demo'

// TEST-02-06 (AC-02-6, NFR-07) and TEST-03-04 (AC-03-4, NFR-06).
afterAll(async () => {
  await prisma.$disconnect()
})

describe('TEST-02-06 (AC-02-6): unexpected errors are safe', () => {
  it('a thrown internal error becomes 500 INTERNAL_ERROR with no stack or SQL text', async () => {
    // A throwaway app that uses the real error handler, so no test-only route
    // has to exist in production code.
    const probe = express()
    probe.get('/boom', () => {
      throw new Error('relation "secret_table" does not exist at prisma.$queryRaw')
    })
    probe.use(errorHandler)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await request(probe).get('/boom')
    spy.mockRestore()
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' } })
    expect(res.text).not.toMatch(/secret_table|prisma|stack|at /)
  })
})

describe('F-02 error handler: known errors (AppError)', () => {
  it('an AppError is answered with its own status, code, message and fields in the standard envelope', async () => {
    const probe = express()
    probe.get('/known', () => {
      throw new AppError(409, 'SOMETHING_CONFLICTS', 'A known conflict.', { title: 'Already used.' })
    })
    probe.use(errorHandler)
    const res = await request(probe).get('/known')
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: { code: 'SOMETHING_CONFLICTS', message: 'A known conflict.', fields: { title: 'Already used.' } } })
  })
})

describe('TEST-02-08 (AC-02-8): request-body errors are client errors, not 500', () => {
  it('a body over the 100 kB limit → 413 PAYLOAD_TOO_LARGE in the standard shape', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'x@test.local', password: 'x'.repeat(120 * 1024) }))
    expect(res.status).toBe(413)
    expect(res.body).toEqual({ error: { code: 'PAYLOAD_TOO_LARGE', message: expect.any(String) } })
  })

  it('malformed JSON → 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('TEST-03-04 (AC-03-4): the seed is repeatable', () => {
  it('running the seed twice keeps the same users, teams, memberships and assignments (same rows, no duplicates)', async () => {
    const emails = DEMO_USERS.map((u) => u.email)
    // A snapshot of row identities, not just counts: a re-run must not delete
    // and re-create rows (new ids) or add duplicates.
    const snapshot = async () => ({
      users: (await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true }, orderBy: { id: 'asc' } })),
      teams: (await prisma.team.findMany({ where: { courseCode: DEMO_TEAMS[0].courseCode }, select: { id: true, name: true }, orderBy: { id: 'asc' } })),
      members: (await prisma.teamMember.findMany({ where: { user: { email: { in: emails } } }, orderBy: [{ teamId: 'asc' }, { userId: 'asc' }] })),
      supervisors: (await prisma.supervisorAssignment.findMany({ where: { user: { email: { in: emails } } }, orderBy: [{ teamId: 'asc' }, { userId: 'asc' }] })),
    })
    // Start without the demo teams (memberships and assignments cascade), so the
    // test proves the seed CREATES them, not merely that they already exist.
    await prisma.team.deleteMany({ where: { courseCode: DEMO_TEAMS[0].courseCode } })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await seed('Seed-test-pass-1')
    const first = await snapshot()
    await seed('Seed-test-pass-1')
    const second = await snapshot()
    log.mockRestore()

    expect([first.users.length, first.teams.length, first.members.length, first.supervisors.length]).toEqual([8, 3, 6, 3])
    expect(second).toEqual(first)
  })
})
