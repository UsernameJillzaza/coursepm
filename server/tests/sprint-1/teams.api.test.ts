import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { cleanupTeams, createTeam } from '../helpers/teams'
import { cleanupUsers, createUser, loginAgent, type TestUser } from '../helpers/users'

// F-03 Teams and membership + the team part of F-02 access scope.
// STS TEST-03-01 … TEST-03-03, plus the team-route parts of TEST-02-01 and
// TEST-02-03 (their milestone/submission parts arrive with #6 and #7).
let a1: TestUser, a2: TestUser, b1: TestUser, sup1: TestUser, sup2: TestUser
let alpha: { id: number }, beta: { id: number }, gamma: { id: number }

beforeAll(async () => {
  ;[a1, a2, b1] = await Promise.all([createUser('STUDENT'), createUser('STUDENT'), createUser('STUDENT')])
  ;[sup1, sup2] = await Promise.all([createUser('SUPERVISOR'), createUser('SUPERVISOR')])
  alpha = await createTeam('Team Alpha', { members: [a1, a2], supervisors: [sup1] })
  beta = await createTeam('Team Beta', { members: [b1], supervisors: [sup2] })
  gamma = await createTeam('Team Gamma', { supervisors: [sup2] })
})
afterAll(async () => {
  await cleanupTeams()
  await cleanupUsers()
  await prisma.$disconnect()
})

describe('GET /api/teams', () => {
  it('TEST-03-01 (AC-03-1): a student sees only their own team, with its members and supervisors', async () => {
    const res = await (await loginAgent(a1)).get('/api/teams')
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    const [team] = res.body.items
    expect(team).toMatchObject({ id: alpha.id, name: 'Team Alpha' })
    expect(team.members.map((m: { id: number }) => m.id).sort()).toEqual([a1.id, a2.id].sort())
    expect(team.supervisors).toEqual([{ id: sup1.id, name: sup1.name }])
  })

  it('TEST-03-01 (AC-03-1): a supervisor sees exactly their assigned teams', async () => {
    const res = await (await loginAgent(sup2)).get('/api/teams')
    expect(res.status).toBe(200)
    expect(res.body.items.map((t: { id: number }) => t.id).sort()).toEqual([beta.id, gamma.id].sort())
  })

  it('member objects expose only id and name (no e-mail or password data)', async () => {
    const res = await (await loginAgent(a1)).get('/api/teams')
    expect(Object.keys(res.body.items[0].members[0]).sort()).toEqual(['id', 'name'])
    expect(res.text).not.toMatch(/password|scrypt\$|@test\.local/i)
  })
})

describe('GET /api/teams/:teamId', () => {
  it('returns the team for a member', async () => {
    const res = await (await loginAgent(a2)).get(`/api/teams/${alpha.id}`)
    expect(res.status).toBe(200)
    expect(res.body.team).toMatchObject({ id: alpha.id, name: 'Team Alpha' })
  })

  it('TEST-03-02 (AC-03-2): a student requesting another team gets 404 with no team data', async () => {
    const res = await (await loginAgent(a1)).get(`/api/teams/${beta.id}`)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } })
    expect(res.text).not.toContain('Team Beta')
  })

  it('TEST-03-03 / TEST-02-03 team part (AC-03-3, AC-02-3): an unassigned supervisor gets 404', async () => {
    const res = await (await loginAgent(sup1)).get(`/api/teams/${beta.id}`)
    expect(res.status).toBe(404)
  })

  it('a non-existent id and a non-numeric id both give 404, the same as out of scope', async () => {
    const agent = await loginAgent(a1)
    expect((await agent.get('/api/teams/999999999')).status).toBe(404)
    expect((await agent.get('/api/teams/abc')).status).toBe(404)
  })
})

describe('TEST-02-01 (AC-02-1): protected routes reject a request without a session', () => {
  it.each([
    ['GET', '/api/auth/me'],
    ['GET', '/api/teams'],
    ['GET', '/api/teams/1'],
  ])('%s %s → 401 with only an error body', async (method, path) => {
    const res = await request(app)[method.toLowerCase() as 'get'](path)
    expect(res.status).toBe(401)
    expect(Object.keys(res.body)).toEqual(['error'])
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })
})
