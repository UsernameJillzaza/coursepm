import { randomBytes } from 'node:crypto'
import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { teamScopeWhere } from '../../src/access/scope'
import { DEMO_ADMIN, upsertAccount } from '../../src/seed/demo'
import { cleanupTeams, createTeam } from '../helpers/teams'
import { cleanupUsers, createUser, DEMO_PASSWORD, loginAgent, type TestUser } from '../helpers/users'

// F-09 Course administration (FR-14, BR-01, NFR-02, NFR-04), API level.
// Sprint 2 STS TEST-09-01 … TEST-09-03, 09-05, 09-06, 09-08 … 09-10, 09-12, 09-13.
// TEST-09-14 (AC-09-12, Sprint 2/3 routes) is at the end: the F-07, F-08,
// F-10 and F-11 blocks run.

const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'Only a course administrator can do this.' } }
const tag = () => randomBytes(4).toString('hex')

let admin: TestUser, a1: TestUser, a2: TestUser, b1: TestUser, sup1: TestUser, sup2: TestUser
let alpha: { id: number }, beta: { id: number }
const apiTeamIds: number[] = [] // teams created through POST /api/admin/teams
const fixtureMilestones: number[] = []

beforeAll(async () => {
  ;[admin, a1, a2, b1, sup1, sup2] = await Promise.all([
    createUser('ADMIN'), createUser('STUDENT'), createUser('STUDENT'), createUser('STUDENT'),
    createUser('SUPERVISOR'), createUser('SUPERVISOR'),
  ])
  alpha = await createTeam(`Team Alpha ${tag()}`, { members: [a1, a2], supervisors: [sup1] })
  beta = await createTeam(`Team Beta ${tag()}`, { members: [b1], supervisors: [sup2] })
})

afterAll(async () => {
  await prisma.feedback.deleteMany({ where: { submission: { milestoneId: { in: fixtureMilestones } } } })
  await prisma.submission.deleteMany({ where: { milestoneId: { in: fixtureMilestones } } })
  await prisma.milestone.deleteMany({ where: { id: { in: fixtureMilestones } } })
  await prisma.team.deleteMany({ where: { id: { in: apiTeamIds } } })
  await cleanupTeams()
  await cleanupUsers()
  await prisma.$disconnect()
})

// A milestone with revision 1 by `author` and feedback by Supervisor 1, inserted directly.
async function milestoneWithReviewedRevision(title: string, author: TestUser) {
  const milestone = await prisma.milestone.create({
    data: { teamId: alpha.id, title, description: '', deadline: new Date(Date.now() + 48 * 3600000), maxRevisions: 3, createdById: sup1.id },
  })
  fixtureMilestones.push(milestone.id)
  const submission = await prisma.submission.create({
    data: { milestoneId: milestone.id, teamId: alpha.id, revision: 1, title: `${title} v1`, description: '', link: 'https://example.com/v1', submittedById: author.id, submittedAt: new Date() },
  })
  await prisma.feedback.create({ data: { submissionId: submission.id, supervisorId: sup1.id, body: 'Reviewed.' } })
  return { milestone, submission }
}

async function createTeamAsAdmin(agent: request.Agent, body: { courseCode: string; name: string }) {
  const res = await agent.post('/api/admin/teams').send(body)
  if (res.status === 201) apiTeamIds.push(res.body.team.id)
  return res
}

const counts = async () => ({
  teams: await prisma.team.count(),
  members: await prisma.teamMember.count(),
  supervisors: await prisma.supervisorAssignment.count(),
  activeUsers: await prisma.user.count({ where: { isActive: true } }),
})

describe('TEST-09-01 (AC-09-1): the seeded admin signs in with role ADMIN', () => {
  it('login and /api/auth/me both report role ADMIN and never a password or hash', async () => {
    const seeded = await upsertAccount(DEMO_ADMIN, DEMO_PASSWORD)
    expect(seeded.role).toBe('ADMIN')
    const agent = request.agent(app)
    const login = await agent.post('/api/auth/login').send({ email: DEMO_ADMIN.email, password: DEMO_PASSWORD })
    expect(login.status).toBe(200)
    expect(login.body.user).toEqual({ id: seeded.id, name: DEMO_ADMIN.name, email: DEMO_ADMIN.email, role: 'ADMIN' })
    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.user.role).toBe('ADMIN')
    for (const text of [login.text, me.text]) expect(text).not.toMatch(/passwordHash|password|scrypt\$/i)
  })

  it('no admin response carries a password or hash', async () => {
    const agent = await loginAgent(admin)
    const users = await agent.get('/api/admin/users')
    const teams = await agent.get('/api/admin/teams')
    expect(users.status).toBe(200)
    expect(teams.status).toBe(200)
    expect(Object.keys(users.body.items[0]).sort()).toEqual(['email', 'id', 'isActive', 'name', 'role'])
    for (const text of [users.text, teams.text]) expect(text).not.toMatch(/passwordHash|password|scrypt\$/i)
  })
})

describe('TEST-09-02 (AC-09-2): only an ADMIN may call the admin routes', () => {
  // Six routes with valid inputs; :teamId / :userId point at real records.
  const routes = () => [
    ['GET', '/api/admin/users', undefined],
    ['GET', '/api/admin/teams', undefined],
    ['POST', '/api/admin/teams', { courseCode: 'CPE334-DEMO', name: `Team Forbidden ${tag()}` }],
    ['POST', `/api/admin/teams/${beta.id}/members`, { userId: a1.id }],
    ['POST', `/api/admin/teams/${beta.id}/supervisors`, { userId: sup1.id }],
    ['POST', `/api/admin/users/${b1.id}/deactivate`, undefined],
  ] as const

  it('a student and a supervisor get 403 FORBIDDEN on all six, and nothing changes', async () => {
    const before = await counts()
    for (const user of [a1, sup1]) {
      const agent = await loginAgent(user)
      for (const [method, path, body] of routes()) {
        const res = method === 'GET' ? await agent.get(path) : await agent.post(path).send(body ?? {})
        expect({ path, status: res.status, body: res.body }).toEqual({ path, status: 403, body: FORBIDDEN })
      }
    }
    expect(await counts()).toEqual(before)
  })

  it('without a session all six answer 401 UNAUTHENTICATED', async () => {
    for (const [method, path, body] of routes()) {
      const res = method === 'GET' ? await request(app).get(path) : await request(app).post(path).send(body ?? {})
      expect({ path, status: res.status, code: res.body.error?.code }).toEqual({ path, status: 401, code: 'UNAUTHENTICATED' })
    }
  })
})

describe('TEST-09-03 (AC-09-3): create a team', () => {
  it('creates CPE334-DEMO / Team Delta with empty lists, lists it, and refuses the same pair again', async () => {
    const agent = await loginAgent(admin)
    const name = `Team Delta ${tag()}`
    const res = await createTeamAsAdmin(agent, { courseCode: 'CPE334-DEMO', name })
    expect(res.status).toBe(201)
    expect(res.body.team).toEqual({ id: expect.any(Number), courseCode: 'CPE334-DEMO', name, members: [], supervisors: [] })

    const list = await agent.get('/api/admin/teams')
    expect(list.body.items).toContainEqual(res.body.team)

    for (const courseCode of ['CPE334-DEMO', 'cpe334-demo', ' cpe334-demo ']) {
      const again = await createTeamAsAdmin(agent, { courseCode, name })
      expect(again.status).toBe(409)
      expect(again.body).toEqual({ error: { code: 'TEAM_EXISTS', message: 'A team with this course code and name already exists.' } })
    }
    expect(await prisma.team.count({ where: { courseCode: 'CPE334-DEMO', name } })).toBe(1)
  })

  it('two identical creates at the same moment give exactly one 201 and one 409, and one row', async () => {
    const agent = await loginAgent(admin)
    const body = { courseCode: 'RACE-9', name: `Team Race ${tag()}` }
    const results = await Promise.all([createTeamAsAdmin(agent, body), createTeamAsAdmin(agent, body)])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect(await prisma.team.count({ where: body })).toBe(1)
  })

  it('teams are listed by course code, then name', async () => {
    const agent = await loginAgent(admin)
    const items: { courseCode: string; name: string }[] = (await agent.get('/api/admin/teams')).body.items
    const keys = items.map((t) => [t.courseCode, t.name])
    const sorted = [...keys].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0))
    expect(keys).toEqual(sorted)
  })
})

describe('TEST-09-05 (AC-09-4): create-team validation over HTTP', () => {
  it('a 21-character code and an 81-character name → 400 with both fields, nothing stored', async () => {
    const agent = await loginAgent(admin)
    const before = await prisma.team.count()
    const res = await createTeamAsAdmin(agent, { courseCode: 'C'.repeat(21), name: 'T'.repeat(81) })
    expect(res.status).toBe(400)
    expect(res.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Please correct the highlighted fields.',
      fields: { courseCode: 'Course code must be 2–20 letters, digits or hyphens.', name: 'Team name must be 2–80 characters.' },
    })
    expect(await prisma.team.count()).toBe(before)
  })
})

describe('TEST-09-06 (AC-09-5): add a member and a supervisor', () => {
  it('adds B1 and Supervisor 2 to a new team; both then see it; a repeat is 409', async () => {
    const agent = await loginAgent(admin)
    const name = `Team Delta ${tag()}`
    const delta = (await createTeamAsAdmin(agent, { courseCode: 'CPE334-DEMO', name })).body.team

    const member = await agent.post(`/api/admin/teams/${delta.id}/members`).send({ userId: b1.id })
    expect(member.status).toBe(201)
    expect(member.body.team.members).toEqual([{ id: b1.id, name: b1.name }])

    const supervisor = await agent.post(`/api/admin/teams/${delta.id}/supervisors`).send({ userId: sup2.id })
    expect(supervisor.status).toBe(201)
    expect(supervisor.body.team).toEqual({ ...delta, members: [{ id: b1.id, name: b1.name }], supervisors: [{ id: sup2.id, name: sup2.name }] })

    // D-07: a student may be in several teams.
    const b1Teams = (await (await loginAgent(b1)).get('/api/teams')).body.items.map((t: { id: number }) => t.id)
    expect(b1Teams.sort()).toEqual([beta.id, delta.id].sort())
    const sup2Teams = (await (await loginAgent(sup2)).get('/api/teams')).body.items.map((t: { id: number }) => t.id)
    expect(sup2Teams).toContain(delta.id)

    const repeat = await agent.post(`/api/admin/teams/${delta.id}/members`).send({ userId: b1.id })
    expect(repeat.status).toBe(409)
    expect(repeat.body).toEqual({ error: { code: 'ALREADY_ASSIGNED', message: 'This account is already in this team.' } })
    const repeatSupervisor = await agent.post(`/api/admin/teams/${delta.id}/supervisors`).send({ userId: sup2.id })
    expect(repeatSupervisor.status).toBe(409)
    expect(repeatSupervisor.body.error.code).toBe('ALREADY_ASSIGNED')
  })
})

describe('TEST-09-08 (AC-09-6): who can be added, and unknown teams', () => {
  it('rejects the wrong role, the admin, an inactive student, an unknown or malformed user ID with 400 fields.userId', async () => {
    const agent = await loginAgent(admin)
    const delta = (await createTeamAsAdmin(agent, { courseCode: 'CPE334-DEMO', name: `Team Delta ${tag()}` })).body.team
    const inactive = await createUser('STUDENT', { isActive: false })
    const before = await counts()

    const cases: [string, unknown, string][] = [
      ['members', sup1.id, 'Only an active student can be added as a member.'],
      ['supervisors', a1.id, 'Only an active supervisor can be assigned to supervise a team.'],
      ['members', admin.id, 'Only an active student can be added as a member.'],
      ['supervisors', admin.id, 'Only an active supervisor can be assigned to supervise a team.'],
      ['members', inactive.id, 'Only an active student can be added as a member.'],
      ['members', 2147483000, 'Only an active student can be added as a member.'],
      ['members', 'abc', 'Choose an account.'],
    ]
    for (const [kind, userId, message] of cases) {
      const res = await agent.post(`/api/admin/teams/${delta.id}/${kind}`).send({ userId })
      expect({ kind, userId, status: res.status, body: res.body }).toEqual({
        kind, userId, status: 400,
        body: { error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fields: { userId: message } } },
      })
    }
    expect(await counts()).toEqual(before)
  })

  it.each([['01'], ['1.5'], [''], [null], [-3], [1.5], ['2147483648']])('userId %j is "Choose an account."', async (userId) => {
    const agent = await loginAgent(admin)
    const res = await agent.post(`/api/admin/teams/${beta.id}/members`).send({ userId })
    expect(res.status).toBe(400)
    expect(res.body.error.fields).toEqual({ userId: 'Choose an account.' })
  })

  it.each([['999999'], ['abc'], ['0']])('team ID %s → 404 "Team not found."', async (teamId) => {
    const agent = await loginAgent(admin)
    for (const kind of ['members', 'supervisors']) {
      const res = await agent.post(`/api/admin/teams/${teamId}/${kind}`).send({ userId: b1.id })
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Team not found.' } })
    }
  })
})

describe('TEST-09-08 (AC-09-6): an add racing a deactivation never stores an inactive account (PR #82 review)', () => {
  it('while a deactivation of the student is still in its transaction, Add member waits for it and then refuses', async () => {
    const agent = await loginAgent(admin)
    const delta = (await createTeamAsAdmin(agent, { courseCode: 'CPE334-DEMO', name: `Team Race Add ${tag()}` })).body.team
    const student = await createUser('STUDENT')
    let add: Promise<request.Response> | undefined
    // Transaction A plays the deactivation: it locks and updates the user row
    // and stays open while the add request (B) runs. Without a lock in B, B
    // reads the last committed row (still active) and inserts at once.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: student.id }, data: { isActive: false } })
      add = agent.post(`/api/admin/teams/${delta.id}/members`).send({ userId: student.id }).then((r) => r)
      await new Promise((resolve) => setTimeout(resolve, 300))
    }, { timeout: 10000 })
    const res = await add!
    expect(res.status).toBe(400)
    expect(res.body.error.fields).toEqual({ userId: 'Only an active student can be added as a member.' })
    expect(await prisma.teamMember.count({ where: { teamId: delta.id, userId: student.id } })).toBe(0)
  })
})

describe('TEST-09-09 (AC-09-7, NFR-04): deactivation ends the session and keeps past work', () => {
  it('deactivating A2 → 401 on the old cookie, no sessions, login refused like a wrong password; work unchanged', async () => {
    const student = await createUser('STUDENT')
    await prisma.teamMember.create({ data: { teamId: alpha.id, userId: student.id } })
    const { milestone } = await milestoneWithReviewedRevision(`Deactivation ${tag()}`, student)
    const listAs = async (user: TestUser) => (await (await loginAgent(user)).get(`/api/milestones/${milestone.id}/submissions`)).body.items
    const beforeA1 = await listAs(a1)
    const beforeSup1 = await listAs(sup1)
    expect(beforeA1).toHaveLength(1)
    expect(beforeA1[0].feedback).not.toBeNull()

    const studentAgent = await loginAgent(student)
    expect((await studentAgent.get('/api/teams')).status).toBe(200)

    const res = await (await loginAgent(admin)).post(`/api/admin/users/${student.id}/deactivate`)
    expect(res.status).toBe(200)
    expect(res.body.user).toEqual({ id: student.id, name: student.name, email: student.email, role: 'STUDENT', isActive: false })

    const after = await studentAgent.get('/api/teams')
    expect(after.status).toBe(401)
    expect(after.body.error.code).toBe('UNAUTHENTICATED')
    expect(await prisma.session.count({ where: { userId: student.id } })).toBe(0)

    const wrong = await request(app).post('/api/auth/login').send({ email: student.email, password: 'wrong-pass-9' })
    const right = await request(app).post('/api/auth/login').send({ email: student.email, password: student.password })
    expect(right.status).toBe(401)
    expect(right.body).toEqual(wrong.body)
    expect(right.body.error.code).toBe('INVALID_CREDENTIALS')

    expect(await listAs(a1)).toEqual(beforeA1)
    expect(await listAs(sup1)).toEqual(beforeSup1)
  })
})

describe('TEST-09-10 (AC-09-8): what cannot be deactivated', () => {
  it('another admin and the admin itself → 409 CANNOT_DEACTIVATE_ADMIN; an inactive account → 409 ALREADY_INACTIVE; unknown IDs → 404', async () => {
    const otherAdmin = await createUser('ADMIN')
    const inactiveSupervisor = await createUser('SUPERVISOR', { isActive: false })
    const agent = await loginAgent(admin)
    const sessionsBefore = await prisma.session.count({ where: { userId: { in: [admin.id, otherAdmin.id] } } })
    const activeBefore = await prisma.user.findMany({ where: { id: { in: [admin.id, otherAdmin.id, inactiveSupervisor.id] } }, select: { id: true, isActive: true }, orderBy: { id: 'asc' } })

    for (const target of [otherAdmin, admin]) {
      const res = await agent.post(`/api/admin/users/${target.id}/deactivate`)
      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: { code: 'CANNOT_DEACTIVATE_ADMIN', message: 'Administrator accounts cannot be deactivated here.' } })
    }
    const inactive = await agent.post(`/api/admin/users/${inactiveSupervisor.id}/deactivate`)
    expect(inactive.status).toBe(409)
    expect(inactive.body).toEqual({ error: { code: 'ALREADY_INACTIVE', message: 'This account is already inactive.' } })

    for (const userId of ['999999', 'abc']) {
      const res = await agent.post(`/api/admin/users/${userId}/deactivate`)
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Account not found.' } })
    }

    expect(await prisma.session.count({ where: { userId: { in: [admin.id, otherAdmin.id] } } })).toBe(sessionsBefore)
    expect(await prisma.user.findMany({ where: { id: { in: [admin.id, otherAdmin.id, inactiveSupervisor.id] } }, select: { id: true, isActive: true }, orderBy: { id: 'asc' } })).toEqual(activeBefore)
    // The admin's own session still works.
    expect((await agent.get('/api/admin/teams')).status).toBe(200)
  })
})

describe('TEST-09-12 (AC-09-9): an admin never reaches team work on the Sprint 1 routes', () => {
  it('GET /api/teams is empty and every team, milestone, submission and feedback route is 404', async () => {
    const title = `Admin-hidden ${tag()}`
    const { milestone, submission } = await milestoneWithReviewedRevision(title, a1)
    // A second revision without feedback, so the feedback POST would be valid for an assigned supervisor.
    const revision2 = await prisma.submission.create({
      data: { milestoneId: milestone.id, teamId: alpha.id, revision: 2, title: `${title} v2`, description: '', link: 'https://example.com/v2', submittedById: a1.id, submittedAt: new Date() },
    })
    const agent = await loginAgent(admin)
    const before = { milestones: await prisma.milestone.count(), submissions: await prisma.submission.count(), feedback: await prisma.feedback.count() }

    const teams = await agent.get('/api/teams')
    expect(teams.status).toBe(200)
    expect(teams.body).toEqual({ items: [] })

    const deadline = new Date(Date.now() + 72 * 3600000).toISOString()
    const calls = [
      agent.get(`/api/teams/${alpha.id}`),
      agent.get(`/api/teams/${alpha.id}/milestones`),
      agent.get(`/api/milestones/${milestone.id}`),
      agent.get(`/api/milestones/${milestone.id}/submissions`),
      agent.post(`/api/teams/${alpha.id}/milestones`).send({ title: 'Admin milestone', description: '', deadline, maxRevisions: 3 }),
      agent.post(`/api/milestones/${milestone.id}/submissions`).send({ title: 'Admin work', description: '', link: 'https://example.com/admin' }),
      agent.post(`/api/submissions/${revision2.id}/feedback`).send({ body: 'Admin feedback' }),
    ]
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
      expect(res.text).not.toContain(title)
      expect(res.text).not.toContain('Team Alpha')
    }
    expect(submission.id).toBeGreaterThan(0)
    expect({ milestones: await prisma.milestone.count(), submissions: await prisma.submission.count(), feedback: await prisma.feedback.count() }).toEqual(before)
  })
})

describe('TEST-09-12 (AC-09-9): the ADMIN scope branch is a rule, not a data accident', () => {
  it('teamScopeWhere gives an ADMIN a filter that matches no team', () => {
    expect(teamScopeWhere({ id: admin.id, name: admin.name, email: admin.email, role: 'ADMIN' })).toEqual({ id: { in: [] } })
  })

  it('even an ADMIN wrongly inserted as a supervisor (bypassing the API) sees no team and gets 404', async () => {
    const strayAdmin = await createUser('ADMIN')
    await prisma.supervisorAssignment.create({ data: { teamId: alpha.id, userId: strayAdmin.id } })
    try {
      const agent = await loginAgent(strayAdmin)
      expect((await agent.get('/api/teams')).body).toEqual({ items: [] })
      expect((await agent.get(`/api/teams/${alpha.id}`)).status).toBe(404)
      expect((await agent.get(`/api/teams/${alpha.id}/milestones`)).status).toBe(404)
    } finally {
      await prisma.supervisorAssignment.delete({ where: { teamId_userId: { teamId: alpha.id, userId: strayAdmin.id } } })
    }
  })
})

describe('TEST-09-13 (AC-09-10): list accounts with filters', () => {
  const RANK = { ADMIN: 0, SUPERVISOR: 1, STUDENT: 2 } as const
  type Item = { id: number; name: string; role: keyof typeof RANK; isActive: boolean }
  const inOrder = (items: Item[]) =>
    items.every((u, i) => {
      if (i === 0) return true
      const p = items[i - 1]
      if (RANK[p.role] !== RANK[u.role]) return RANK[p.role] < RANK[u.role]
      if (p.name !== u.name) return p.name < u.name
      return p.id < u.id
    })

  it('role=STUDENT&active=true lists exactly the active students, in order; no filter lists everyone in order', async () => {
    const inactive = await createUser('STUDENT', { isActive: false })
    const agent = await loginAgent(admin)

    const filtered = await agent.get('/api/admin/users?role=STUDENT&active=true')
    expect(filtered.status).toBe(200)
    const expectedIds = (await prisma.user.findMany({ where: { role: 'STUDENT', isActive: true }, select: { id: true } })).map((u) => u.id).sort((x, y) => x - y)
    expect(filtered.body.items.map((u: Item) => u.id).sort((x: number, y: number) => x - y)).toEqual(expectedIds)
    expect(filtered.body.items.map((u: Item) => u.id)).not.toContain(inactive.id)
    expect(inOrder(filtered.body.items)).toBe(true)

    const all = await agent.get('/api/admin/users')
    expect(all.body.items).toHaveLength(await prisma.user.count())
    expect(all.body.items.find((u: Item) => u.id === inactive.id)).toMatchObject({ isActive: false, role: 'STUDENT' })
    expect(inOrder(all.body.items)).toBe(true)
    expect(all.body.items[0].role).toBe('ADMIN')

    const inactiveOnly = await agent.get('/api/admin/users?active=false')
    expect(inactiveOnly.body.items.every((u: Item) => !u.isActive)).toBe(true)
  })

  it('role=TEACHER → 400 fields.role; active=yes → 400 fields.active', async () => {
    const agent = await loginAgent(admin)
    const role = await agent.get('/api/admin/users?role=TEACHER')
    expect(role.status).toBe(400)
    expect(role.body.error.code).toBe('VALIDATION_ERROR')
    expect(Object.keys(role.body.error.fields)).toEqual(['role'])
    const active = await agent.get('/api/admin/users?active=yes')
    expect(active.status).toBe(400)
    expect(Object.keys(active.body.error.fields)).toEqual(['active'])
  })
})

describe('the demo seed adds the admin account (F-09 Data, DoD)', () => {
  it('DEMO_ADMIN is admin@coursepm.test, role ADMIN, and is in no team', async () => {
    expect(DEMO_ADMIN).toEqual({ email: 'admin@coursepm.test', name: 'Course Admin', role: 'ADMIN' })
    const row = await upsertAccount(DEMO_ADMIN, DEMO_PASSWORD)
    expect(await prisma.teamMember.count({ where: { userId: row.id } })).toBe(0)
    expect(await prisma.supervisorAssignment.count({ where: { userId: row.id } })).toBe(0)
  })
})

describe('TEST-09-14 (AC-09-12): an admin gets 404 on the Sprint 2/3 routes', () => {
  // Each block runs once its feature is on the branch (Sprint 2 STS).
  // F-07 block: enabled once F-07 (#79) and F-09 (#78) are on the same branch.
  it('F-07: GET /api/milestones/:id/compare?a=1&b=2 → 404, no Alpha title in the body, nothing stored', async () => {
    const title = `Admin compare ${tag()}`
    const { milestone } = await milestoneWithReviewedRevision(title, a1)
    await prisma.submission.create({
      data: { milestoneId: milestone.id, teamId: alpha.id, revision: 2, title: `${title} v2`, description: 'second', link: 'https://example.com/v2', submittedById: a1.id, submittedAt: new Date() },
    })
    const before = { submissions: await prisma.submission.count(), feedback: await prisma.feedback.count() }
    const res = await (await loginAgent(admin)).get(`/api/milestones/${milestone.id}/compare?a=1&b=2`)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Milestone not found.' } })
    expect(res.text).not.toContain(title)
    expect({ submissions: await prisma.submission.count(), feedback: await prisma.feedback.count() }).toEqual(before)
  })
  // F-08 block: enabled once F-08 (#77) and F-09 (#78) are on the same branch (PR #85 review).
  it('F-08: PATCH /api/milestones/:id, POST …/extensions, POST …/close, GET …/history → 404 each, no Alpha title, nothing stored', async () => {
    const title = `Admin maintain ${tag()}`
    const { milestone } = await milestoneWithReviewedRevision(title, a1)
    const agent = await loginAgent(admin)
    const before = await prisma.milestone.findUniqueOrThrow({ where: { id: milestone.id } })
    const counts = async () => ({
      changes: await prisma.milestoneChange.count({ where: { milestoneId: milestone.id } }),
      extensions: await prisma.deadlineExtension.count({ where: { milestoneId: milestone.id } }),
      milestones: await prisma.milestone.count(),
    })
    const start = await counts()
    const responses = [
      await agent.patch(`/api/milestones/${milestone.id}`).send({ description: 'Changed by the admin' }),
      await agent.post(`/api/milestones/${milestone.id}/extensions`).send({ newDeadline: new Date(Date.now() + 96 * 3600000).toISOString(), reason: 'Admin try' }),
      await agent.post(`/api/milestones/${milestone.id}/close`).send({ reason: 'Admin try' }),
      await agent.get(`/api/milestones/${milestone.id}/history`),
    ]
    for (const res of responses) {
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Milestone not found.' } })
      expect(res.text).not.toContain(title)
    }
    expect(await counts()).toEqual(start)
    expect(await prisma.milestone.findUniqueOrThrow({ where: { id: milestone.id } })).toEqual(before)
  })
  // F-10 block: enabled once F-10 (#80) and F-09 (#78) are on the same branch.
  it('F-10: GET /api/teams/:alpha/board (with and without ?state) → 404, no Alpha title or name in the body', async () => {
    const title = `Admin board ${tag()}`
    await milestoneWithReviewedRevision(title, a1)
    const { name } = await prisma.team.findUniqueOrThrow({ where: { id: alpha.id } })
    const agent = await loginAgent(admin)
    for (const path of [`/api/teams/${alpha.id}/board`, `/api/teams/${alpha.id}/board?state=SUBMITTED`]) {
      const res = await agent.get(path)
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Team not found.' } })
      expect(res.text).not.toContain(title)
      expect(res.text).not.toContain(name)
    }
  })
  // F-11 block: enabled with F-11 (#81).
  it('F-11: GET and PUT /api/milestones/:id/score, POST …/score/release → 404, nothing stored', async () => {
    const title = `Admin score ${tag()}`
    const { milestone } = await milestoneWithReviewedRevision(title, a1)
    const agent = await loginAgent(admin)
    const calls = [
      await agent.get(`/api/milestones/${milestone.id}/score`),
      await agent.put(`/api/milestones/${milestone.id}/score`).send({ score: 80 }),
      await agent.post(`/api/milestones/${milestone.id}/score/release`),
    ]
    for (const res of calls) {
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Milestone not found.' } })
      expect(res.text).not.toContain(title)
    }
    expect(await prisma.milestoneScore.count({ where: { milestoneId: milestone.id } })).toBe(0)
  })
})
