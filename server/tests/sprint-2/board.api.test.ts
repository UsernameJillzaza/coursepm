import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { cleanupTeams, createTeam } from '../helpers/teams'
import { cleanupUsers, createUser, loginAgent, type TestUser } from '../helpers/users'

// F-10 board through the API and the real database (contract
// docs/sprints/sprint-2/F-10-progress-board.md): STS TEST-10-03 … TEST-10-06.
let a1: TestUser, a2: TestUser, b1: TestUser, sup1: TestUser, sup2: TestUser
let board: { id: number; name: string }, beta: { id: number }, empty: { id: number }
type Agent = Awaited<ReturnType<typeof loginAgent>>
let asA1: Agent, asSup1: Agent, asSup2: Agent, asB1: Agent
const teamIds: number[] = []

const hours = (n: number) => new Date(Date.now() + n * 3_600_000)
const STATE_FIELDS = { state: 'State must be one of NOT_SUBMITTED, SUBMITTED, FEEDBACK_GIVEN, OVERDUE, CLOSED.' }
const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Team not found.' } }
const ITEM_KEYS = ['closedAt', 'deadline', 'extended', 'latest', 'maxRevisions', 'milestoneId', 'originalDeadline', 'revisionsUsed', 'state', 'title'].sort()
const LATEST_KEYS = ['hasFeedback', 'revision', 'submittedAt', 'submittedBy'].sort()

// Milestones, revisions, feedback, extensions and closes are inserted directly
// so a test can use past deadlines (STS note); TEST-10-06 uses the real API.
const milestone = (teamId: number, title: string, deadline: Date, over: { maxRevisions?: number; closedAt?: Date } = {}) =>
  prisma.milestone.create({
    data: {
      teamId, title, description: 'Board fixture', deadline, maxRevisions: over.maxRevisions ?? 3, createdById: sup1.id,
      ...(over.closedAt ? { closedAt: over.closedAt, closedById: sup1.id } : {}),
    },
  })
const revision = (m: { id: number; teamId: number }, n: number, by: TestUser, at: Date) =>
  prisma.submission.create({
    data: { milestoneId: m.id, teamId: m.teamId, revision: n, title: `Work v${n}`, description: '', link: `https://example.com/v${n}`, submittedById: by.id, submittedAt: at },
  })
const feedbackOn = (submissionId: number) =>
  prisma.feedback.create({ data: { submissionId, supervisorId: sup1.id, body: 'Looks good' } })

// TEST-10-03 fixture: one milestone per state plus a second NOT_SUBMITTED one
// with the same deadline as the (extended) first.
const t = Date.now().toString(36)
const titles = {
  overdue: `Board overdue ${t}`,
  feedback: `Board feedback ${t}`,
  extended: `Board extended ${t}`,
  plain: `Board plain ${t}`,
  submitted: `Board submitted ${t}`,
  closed: `Board closed ${t}`,
}
const ids: Record<keyof typeof titles, number> = { overdue: 0, feedback: 0, extended: 0, plain: 0, submitted: 0, closed: 0 }
let sameDeadline: Date

beforeAll(async () => {
  ;[a1, a2, b1, sup1, sup2] = await Promise.all([
    createUser('STUDENT'), createUser('STUDENT'), createUser('STUDENT'), createUser('SUPERVISOR'), createUser('SUPERVISOR'),
  ])
  board = await createTeam(`Team Board ${t}`, { members: [a1, a2], supervisors: [sup1] })
  beta = await createTeam(`Team Beta ${t}`, { members: [b1], supervisors: [sup2] })
  empty = await createTeam(`Team Empty ${t}`, { members: [a1], supervisors: [sup1] })
  teamIds.push(board.id, beta.id, empty.id)
  ;[asA1, asSup1, asSup2, asB1] = await Promise.all([loginAgent(a1), loginAgent(sup1), loginAgent(sup2), loginAgent(b1)])

  const overdue = await milestone(board.id, titles.overdue, hours(-48))
  const feedback = await milestone(board.id, titles.feedback, hours(-24))
  await feedbackOn((await revision(feedback, 1, a1, hours(-30))).id)
  // Extended from +24 h to +48 h, the same way F-08 stores an extension.
  sameDeadline = hours(48)
  const extended = await milestone(board.id, titles.extended, hours(24))
  await prisma.deadlineExtension.create({
    data: { milestoneId: extended.id, previousDeadline: extended.deadline, newDeadline: sameDeadline, reason: 'Lab outage', grantedById: sup1.id, grantedAt: new Date() },
  })
  await prisma.milestone.update({ where: { id: extended.id }, data: { deadline: sameDeadline } })
  const plain = await milestone(board.id, titles.plain, sameDeadline)
  const submitted = await milestone(board.id, titles.submitted, hours(72), { maxRevisions: 4 })
  await feedbackOn((await revision(submitted, 1, a1, hours(-5))).id)
  await revision(submitted, 2, a2, hours(-1))
  const closed = await milestone(board.id, titles.closed, hours(96), { closedAt: hours(-2) })
  await feedbackOn((await revision(closed, 1, a1, hours(-3))).id)
  Object.assign(ids, { overdue: overdue.id, feedback: feedback.id, extended: extended.id, plain: plain.id, submitted: submitted.id, closed: closed.id })
})

afterAll(async () => {
  // Foreign keys are RESTRICT, so the test data is removed child-first.
  const ms = { milestone: { teamId: { in: teamIds } } }
  await prisma.feedback.deleteMany({ where: { submission: { teamId: { in: teamIds } } } })
  await prisma.submission.deleteMany({ where: { teamId: { in: teamIds } } })
  await prisma.milestoneChange.deleteMany({ where: ms })
  await prisma.deadlineExtension.deleteMany({ where: ms })
  await prisma.milestone.deleteMany({ where: { teamId: { in: teamIds } } })
  await cleanupTeams()
  await cleanupUsers()
  await prisma.$disconnect()
})

type Item = { milestoneId: number; title: string; state: string; deadline: string; originalDeadline: string; extended: boolean; closedAt: string | null; revisionsUsed: number; maxRevisions: number; latest: null | { revision: number; hasFeedback: boolean; submittedAt: string; submittedBy: { id: number; name: string } } }
const byId = (items: Item[], id: number) => items.find((i) => i.milestoneId === id)!
const stateOf = async (agent: Agent, teamId: number, id: number) => byId((await agent.get(`/api/teams/${teamId}/board`)).body.items, id).state

describe('GET /api/teams/:teamId/board (FR-15)', () => {
  it('TEST-10-03 (AC-10-3): A1 and Supervisor 1 get every state, the documented shape, counts and order', async () => {
    for (const agent of [asA1, asSup1]) {
      const start = Date.now()
      const res = await agent.get(`/api/teams/${board.id}/board`)
      const end = Date.now()
      expect(res.status).toBe(200)
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.body.team).toEqual({ id: board.id, name: board.name })
      const generatedAt = new Date(res.body.generatedAt).getTime()
      expect(generatedAt).toBeGreaterThanOrEqual(start)
      expect(generatedAt).toBeLessThanOrEqual(end)

      const items: Item[] = res.body.items
      for (const item of items) expect(Object.keys(item).sort()).toEqual(ITEM_KEYS)
      expect(items.map((i) => i.milestoneId)).toEqual([
        ids.overdue, ids.feedback, Math.min(ids.extended, ids.plain), Math.max(ids.extended, ids.plain), ids.submitted, ids.closed,
      ])
      expect(Object.fromEntries(items.map((i) => [i.title, i.state]))).toEqual({
        [titles.overdue]: 'OVERDUE',
        [titles.feedback]: 'FEEDBACK_GIVEN',
        [titles.extended]: 'NOT_SUBMITTED',
        [titles.plain]: 'NOT_SUBMITTED',
        [titles.submitted]: 'SUBMITTED',
        [titles.closed]: 'CLOSED',
      })
      expect(res.body.counts).toEqual({ NOT_SUBMITTED: 2, SUBMITTED: 1, FEEDBACK_GIVEN: 1, OVERDUE: 1, CLOSED: 1 })
      expect(Object.values(res.body.counts as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(items.length)

      const submitted = byId(items, ids.submitted)
      expect(Object.keys(submitted.latest!).sort()).toEqual(LATEST_KEYS)
      expect(submitted).toMatchObject({ revisionsUsed: 2, maxRevisions: 4, closedAt: null, extended: false })
      expect(submitted.latest).toMatchObject({ revision: 2, hasFeedback: false, submittedBy: { id: a2.id, name: a2.name } })
      expect(submitted.originalDeadline).toBe(submitted.deadline)

      const extended = byId(items, ids.extended)
      expect(extended.extended).toBe(true)
      expect(extended.deadline).toBe(sameDeadline.toISOString())
      expect(extended.originalDeadline).not.toBe(extended.deadline)
      expect(byId(items, ids.plain)).toMatchObject({ extended: false, deadline: sameDeadline.toISOString(), latest: null, revisionsUsed: 0 })
      expect(byId(items, ids.plain).originalDeadline).toBe(sameDeadline.toISOString())

      const closed = byId(items, ids.closed)
      expect(closed.closedAt).not.toBeNull()
      expect(closed.latest).toMatchObject({ revision: 1, hasFeedback: true, submittedBy: { id: a1.id } })
      expect(byId(items, ids.feedback).latest).toMatchObject({ revision: 1, hasFeedback: true })
      expect(byId(items, ids.overdue)).toMatchObject({ latest: null, revisionsUsed: 0, maxRevisions: 3 })
    }
  })

  it('TEST-10-04 (AC-10-4): Supervisor 2, B1, an unknown ID, abc and 0 → 404 with no team data; no session → 401', async () => {
    const responses = [
      await asSup2.get(`/api/teams/${board.id}/board`),
      await asB1.get(`/api/teams/${board.id}/board`),
      await asSup1.get('/api/teams/2147483647/board'),
      await asSup1.get('/api/teams/abc/board'),
      await asSup1.get('/api/teams/0/board'),
    ]
    for (const res of responses) {
      expect(res.status).toBe(404)
      expect(res.body).toEqual(NOT_FOUND)
      for (const title of Object.values(titles)) expect(res.text).not.toContain(title)
      expect(res.text).not.toContain(board.name)
    }
    const anonymous = await request(app).get(`/api/teams/${board.id}/board`)
    expect(anonymous.status).toBe(401)
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('TEST-10-05 (AC-10-5): ?state filters the items, counts stay whole-team; bad values 400; scope first; empty team', async () => {
    const all = await asSup1.get(`/api/teams/${board.id}/board`)
    const filtered = await asSup1.get(`/api/teams/${board.id}/board?state=OVERDUE`)
    expect(filtered.status).toBe(200)
    expect(filtered.body.items.map((i: Item) => i.milestoneId)).toEqual([ids.overdue])
    expect(filtered.body.counts).toEqual(all.body.counts)

    for (const query of ['state=overdue', 'state=DONE', 'state=', 'state=OVERDUE&state=CLOSED']) {
      const res = await asSup1.get(`/api/teams/${board.id}/board?${query}`)
      expect(res.status, query).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.fields).toEqual(STATE_FIELDS)
    }

    const outOfScope = await asSup2.get(`/api/teams/${board.id}/board?state=DONE`)
    expect(outOfScope.status).toBe(404)
    expect(outOfScope.body).toEqual(NOT_FOUND)

    const none = await asSup1.get(`/api/teams/${empty.id}/board`)
    expect(none.status).toBe(200)
    expect(none.body.items).toEqual([])
    expect(none.body.counts).toEqual({ NOT_SUBMITTED: 0, SUBMITTED: 0, FEEDBACK_GIVEN: 0, OVERDUE: 0, CLOSED: 0 })
  })

  it('TEST-10-06 (AC-10-6): each submission, feedback, extension and close shows on the next GET', async () => {
    const team = await createTeam(`Team Flow ${t}`, { members: [a1], supervisors: [sup1] })
    teamIds.push(team.id)
    const m1 = await milestone(team.id, `Flow M1 ${t}`, hours(48))
    const m2 = await milestone(team.id, `Flow M2 ${t}`, hours(-24))
    const m3 = await milestone(team.id, `Flow M3 ${t}`, hours(72))
    const states = async () => {
      const res = await asA1.get(`/api/teams/${team.id}/board`)
      expect(res.status).toBe(200)
      return [byId(res.body.items, m1.id).state, byId(res.body.items, m2.id).state, byId(res.body.items, m3.id).state]
    }
    expect(await states()).toEqual(['NOT_SUBMITTED', 'OVERDUE', 'NOT_SUBMITTED'])

    const work = { title: 'Flow work', description: '', link: 'https://github.com/example/p/pull/1' }
    const first = await asA1.post(`/api/milestones/${m1.id}/submissions`).send(work)
    expect(first.status).toBe(201)
    expect(await states()).toEqual(['SUBMITTED', 'OVERDUE', 'NOT_SUBMITTED'])

    // CHG-01: feedback on revision 1 comes before revision 2.
    const fb = await asSup1.post(`/api/submissions/${first.body.submission.id}/feedback`).send({ body: 'Good start' })
    expect(fb.status).toBe(201)
    expect(await states()).toEqual(['FEEDBACK_GIVEN', 'OVERDUE', 'NOT_SUBMITTED'])

    const ext = await asSup1.post(`/api/milestones/${m2.id}/extensions`).send({ newDeadline: hours(24).toISOString(), reason: 'Lab outage' })
    expect(ext.status).toBe(201)
    expect(await states()).toEqual(['FEEDBACK_GIVEN', 'NOT_SUBMITTED', 'NOT_SUBMITTED'])

    const close = await asSup1.post(`/api/milestones/${m3.id}/close`).send({ reason: 'Merged into M1' })
    expect(close.status).toBe(200)
    expect(await states()).toEqual(['FEEDBACK_GIVEN', 'NOT_SUBMITTED', 'CLOSED'])

    const second = await asA1.post(`/api/milestones/${m1.id}/submissions`).send({ ...work, title: 'Flow work v2' })
    expect(second.status).toBe(201)
    expect(await states()).toEqual(['SUBMITTED', 'NOT_SUBMITTED', 'CLOSED'])
    expect(await stateOf(asSup1, team.id, m1.id)).toBe('SUBMITTED')
  })
})
