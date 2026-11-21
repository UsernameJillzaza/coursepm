import { prisma } from '../../src/db'
import { parseId } from '../../src/http'
import { cleanupTeams, createTeam } from '../helpers/teams'
import { cleanupUsers, createUser, loginAgent, type TestUser } from '../helpers/users'

// Lab 6 regression tests for Issue #57 (partner UAT finding DEF-CP-01).
// A path ID that cannot be a row ID (above PostgreSQL INT4 max, or written as
// hex / exponent / with a sign) must be "not found" (AC-02-2, AC-02-3,
// AC-03-5, NFR-02), never a 500 and never another row.

const INT4_MAX = 2147483647
const OUT_OF_RANGE = ['2147483648', '9999999999999', '1e20']
const NON_CANONICAL = ['0x1', '1e0', '+1', '01', ' 1', '1.0']

let student: TestUser, supervisor: TestUser
let team: { id: number }

beforeAll(async () => {
  student = await createUser('STUDENT')
  supervisor = await createUser('SUPERVISOR')
  team = await createTeam('Team Lab6 ID bounds', { members: [student], supervisors: [supervisor] })
})
afterAll(async () => {
  await cleanupTeams()
  await cleanupUsers()
  await prisma.$disconnect()
})

describe('TEST-L6-57-01 parseId accepts only canonical IDs within INT4', () => {
  it('accepts 1 and the INT4 maximum', () => {
    expect(parseId('1')).toBe(1)
    expect(parseId(String(INT4_MAX))).toBe(INT4_MAX)
  })

  it.each([...OUT_OF_RANGE, ...NON_CANONICAL, '0', '-1', 'abc', ''])('rejects %j', (value) => {
    expect(parseId(value)).toBeNull()
  })
})

// The seven routes that take a numeric path ID (partner report, step 4).
const ROUTES: [string, 'get' | 'post', (id: string) => string, 'student' | 'supervisor', object?][] = [
  ['GET /api/teams/:id', 'get', (id) => `/api/teams/${id}`, 'student'],
  ['GET /api/teams/:id/milestones', 'get', (id) => `/api/teams/${id}/milestones`, 'student'],
  ['POST /api/teams/:id/milestones', 'post', (id) => `/api/teams/${id}/milestones`, 'supervisor', {
    title: 'Out of range', description: '', deadline: '2099-01-01T00:00:00.000Z', maxRevisions: 1,
  }],
  ['GET /api/milestones/:id', 'get', (id) => `/api/milestones/${id}`, 'student'],
  ['GET /api/milestones/:id/submissions', 'get', (id) => `/api/milestones/${id}/submissions`, 'student'],
  ['POST /api/milestones/:id/submissions', 'post', (id) => `/api/milestones/${id}/submissions`, 'student', {
    title: 'Out of range', link: 'https://example.com/x',
  }],
  ['POST /api/submissions/:id/feedback', 'post', (id) => `/api/submissions/${id}/feedback`, 'supervisor', {
    body: 'Out of range',
  }],
]

describe('TEST-L6-57-02 (AC-02-2, AC-02-3, NFR-02): out-of-range IDs return 404 on every ID route', () => {
  it.each(ROUTES)('%s', async (_name, method, path, who, body) => {
    const agent = await loginAgent(who === 'student' ? student : supervisor)
    for (const id of OUT_OF_RANGE) {
      const req = agent[method](path(id))
      const res = body ? await req.send(body) : await req
      expect({ id, status: res.status }).toEqual({ id, status: 404 })
      expect(res.body.error.code).toBe('NOT_FOUND')
    }
  })
})

describe('TEST-L6-57-03 (AC-03-5): non-canonical spellings of a real team ID are not that team', () => {
  it('returns 404 for 0x1-style spellings of the student\'s own team ID', async () => {
    const agent = await loginAgent(student)
    expect((await agent.get(`/api/teams/${team.id}`)).status).toBe(200)
    const spellings = [`0x${team.id.toString(16)}`, `${team.id}e0`, `+${team.id}`, `0${team.id}`, `${team.id}.0`]
    for (const id of spellings) {
      const res = await agent.get(`/api/teams/${encodeURIComponent(id)}`)
      expect({ id, status: res.status }).toEqual({ id, status: 404 })
      expect(res.text).not.toContain('Team Lab6 ID bounds')
    }
  })
})
