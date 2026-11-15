import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { cleanupTeams, createTeam } from '../helpers/teams'
import { cleanupUsers, createUser, loginAgent, type TestUser } from '../helpers/users'

// F-05 submissions through the API and the real database: STS TEST-05-01,
// -02, -04, -06, -07 (API part), -08, -09 (feedback part arrives with F-06,
// #8), -10, plus the submission parts of TEST-02-01, -02 and -03.
let a1: TestUser, a2: TestUser, b1: TestUser, sup1: TestUser, sup2: TestUser
let alpha: { id: number }, beta: { id: number }

const hours = (n: number) => new Date(Date.now() + n * 60 * 60 * 1000)
const work = (over: Record<string, unknown> = {}) => ({
  title: 'Proposal v1',
  description: 'First draft of the proposal',
  link: 'https://github.com/example/proposal/pull/1',
  ...over,
})
// Milestones are inserted directly so tests can use past deadlines, which the
// API rightly refuses to create (STS note).
const milestone = (over: { deadline?: Date; maxRevisions?: number; teamId?: number } = {}) =>
  prisma.milestone.create({
    data: {
      teamId: over.teamId ?? alpha.id,
      title: 'M',
      description: '',
      deadline: over.deadline ?? hours(48),
      maxRevisions: over.maxRevisions ?? 3,
      createdById: sup1.id,
    },
  })
const count = (milestoneId: number) => prisma.submission.count({ where: { milestoneId } })
const post = async (user: TestUser, milestoneId: number, body = work()) =>
  (await loginAgent(user)).post(`/api/milestones/${milestoneId}/submissions`).send(body)

beforeAll(async () => {
  ;[a1, a2, b1, sup1, sup2] = await Promise.all([
    createUser('STUDENT'),
    createUser('STUDENT'),
    createUser('STUDENT'),
    createUser('SUPERVISOR'),
    createUser('SUPERVISOR'),
  ])
  alpha = await createTeam('Team Alpha', { members: [a1, a2], supervisors: [sup1] })
  beta = await createTeam('Team Beta', { members: [b1], supervisors: [sup2] })
})
afterAll(async () => {
  // Foreign keys are RESTRICT (submissions are never deleted by the app), so the
  // test data is removed child-first.
  const teamIds = [alpha.id, beta.id]
  await prisma.submission.deleteMany({ where: { teamId: { in: teamIds } } })
  await prisma.milestone.deleteMany({ where: { teamId: { in: teamIds } } })
  await cleanupTeams()
  await cleanupUsers()
  await prisma.$disconnect()
})

describe('POST /api/milestones/:id/submissions', () => {
  it('TEST-05-01 (AC-05-1): a team student submits → 201 revision 1 in the contract shape; a fresh GET returns it', async () => {
    const m = await milestone()
    const before = Date.now()
    const res = await post(a1, m.id, work({ submittedAt: '2000-01-01T00:00:00Z', revision: 99 }))
    expect(res.status).toBe(201)
    expect(Object.keys(res.body.submission).sort()).toEqual(['description', 'id', 'link', 'revision', 'submittedAt', 'submittedBy', 'title'])
    expect(res.body.submission).toMatchObject({
      revision: 1,
      title: 'Proposal v1',
      submittedBy: { id: a1.id, name: a1.name },
    })
    // The server clock is used; a client-sent submittedAt or revision is ignored (BR-06).
    expect(new Date(res.body.submission.submittedAt).getTime()).toBeGreaterThanOrEqual(before - 1000)

    const list = await (await loginAgent(a2)).get(`/api/milestones/${m.id}/submissions`)
    expect(list.status).toBe(200)
    expect(list.body.items.map((s: { id: number }) => s.id)).toEqual([res.body.submission.id])
  })

  it('TEST-05-02 (AC-05-2): a resubmission is revision 2 and revision 1 is unchanged', async () => {
    const m = await milestone()
    const first = await post(a1, m.id)
    const stored1 = await prisma.submission.findUniqueOrThrow({ where: { id: first.body.submission.id } })
    const second = await post(a2, m.id, work({ title: 'Proposal v2', link: 'https://example.com/v2' }))
    expect(second.status).toBe(201)
    expect(second.body.submission).toMatchObject({ revision: 2, title: 'Proposal v2', submittedBy: { id: a2.id } })
    expect(await prisma.submission.findUniqueOrThrow({ where: { id: first.body.submission.id } })).toEqual(stored1)
  })

  it('TEST-05-04 (AC-05-3): after the deadline → 409 DEADLINE_PASSED and nothing is stored', async () => {
    const m = await milestone({ deadline: hours(-1) })
    const res = await post(a1, m.id)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('DEADLINE_PASSED')
    expect(await count(m.id)).toBe(0)
  })

  it('TEST-05-06 (AC-05-4): at the revision limit → 409 REVISION_LIMIT_REACHED; the count stays at the limit', async () => {
    const m = await milestone({ maxRevisions: 2 })
    expect((await post(a1, m.id)).status).toBe(201)
    expect((await post(a1, m.id)).status).toBe(201)
    const third = await post(a1, m.id)
    expect(third.status).toBe(409)
    expect(third.body.error.code).toBe('REVISION_LIMIT_REACHED')
    expect(await count(m.id)).toBe(2)
  })

  it('TEST-05-07 (AC-05-5): an invalid link or title → 400 naming the field; nothing stored', async () => {
    const m = await milestone()
    const badLink = await post(a1, m.id, work({ link: 'javascript:alert(1)' }))
    expect(badLink.status).toBe(400)
    expect(Object.keys(badLink.body.error.fields)).toEqual(['link'])
    const badTitle = await post(a1, m.id, work({ title: 'ab' }))
    expect(badTitle.status).toBe(400)
    expect(Object.keys(badTitle.body.error.fields)).toEqual(['title'])
    expect(await count(m.id)).toBe(0)
  })

  it('TEST-05-08 (AC-05-6): two simultaneous submissions become revisions 1 and 2, never duplicates', async () => {
    const m = await milestone({ maxRevisions: 3 })
    const [x, y] = await Promise.all([loginAgent(a1), loginAgent(a2)])
    const results = await Promise.all([
      x.post(`/api/milestones/${m.id}/submissions`).send(work({ title: 'From A1' })),
      y.post(`/api/milestones/${m.id}/submissions`).send(work({ title: 'From A2' })),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([201, 201])
    expect((await prisma.submission.findMany({ where: { milestoneId: m.id } })).map((s) => s.revision).sort()).toEqual([1, 2])
  })

  it('TEST-05-10 (AC-05-9): limit 1, two at once → exactly one 201 revision 1 and one 409 REVISION_LIMIT_REACHED', async () => {
    const m = await milestone({ maxRevisions: 1 })
    const [x, y] = await Promise.all([loginAgent(a1), loginAgent(a2)])
    const results = await Promise.all([
      x.post(`/api/milestones/${m.id}/submissions`).send(work()),
      y.post(`/api/milestones/${m.id}/submissions`).send(work()),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect(results.find((r) => r.status === 201)!.body.submission.revision).toBe(1)
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('REVISION_LIMIT_REACHED')
    expect(await count(m.id)).toBe(1)
  })

  it('check order: role before fields (supervisor + invalid body → 403), fields before rules (invalid body on a closed milestone → 400), non-numeric id → 404', async () => {
    const open = await milestone()
    const closed = await milestone({ deadline: hours(-1) })
    const supBad = await post(sup1, open.id, work({ link: 'not a url' }))
    expect(supBad.status).toBe(403)
    const closedBad = await post(a1, closed.id, work({ link: 'not a url' }))
    expect(closedBad.status).toBe(400)
    expect(Object.keys(closedBad.body.error.fields)).toEqual(['link'])
    for (const path of ['/api/milestones/abc/submissions', '/api/milestones/0/submissions']) {
      expect((await (await loginAgent(a1)).post(path).send(work())).status).toBe(404)
      expect((await (await loginAgent(a1)).get(path)).status).toBe(404)
    }
    expect(await count(open.id)).toBe(0)
    expect(await count(closed.id)).toBe(0)
  })

  it('a supervisor of the team cannot submit → 403 (scope first, then role); a student of another team → 404', async () => {
    const m = await milestone()
    const sup = await post(sup1, m.id)
    expect(sup.status).toBe(403)
    expect(sup.body.error.code).toBe('FORBIDDEN')
    expect((await post(b1, m.id)).status).toBe(404)
    expect(await count(m.id)).toBe(0)
  })
})

describe('GET /api/milestones/:id/submissions', () => {
  it('TEST-05-09 (AC-05-7), F-05 part: newest revision first, each with its submitter and a feedback slot (null until F-06)', async () => {
    const m = await milestone()
    await post(a1, m.id, work({ title: 'Rev one' }))
    await post(a1, m.id, work({ title: 'Rev two' }))
    const res = await (await loginAgent(sup1)).get(`/api/milestones/${m.id}/submissions`)
    expect(res.status).toBe(200)
    expect(res.body.items.map((s: { revision: number; title: string }) => [s.revision, s.title])).toEqual([
      [2, 'Rev two'],
      [1, 'Rev one'],
    ])
    expect(res.body.items[0]).toMatchObject({ submittedBy: { id: a1.id, name: a1.name }, feedback: null })
  })

  it('TEST-02-02 / TEST-02-03 submission part (AC-02-2, AC-02-3): outsiders get 404 with no submission data', async () => {
    const m = await milestone()
    await post(a1, m.id, work({ title: 'Secret alpha work' }))
    for (const outsider of [b1, sup2]) {
      const res = await (await loginAgent(outsider)).get(`/api/milestones/${m.id}/submissions`)
      expect(res.status).toBe(404)
      expect(res.text).not.toContain('Secret alpha work')
    }
  })

  it('the milestone list and detail report revisionsUsed and latestSubmittedAt from stored revisions', async () => {
    const m = await milestone({ maxRevisions: 3 })
    const created = await post(a1, m.id)
    const detail = await (await loginAgent(a2)).get(`/api/milestones/${m.id}`)
    expect(detail.body.milestone).toMatchObject({ revisionsUsed: 1, maxRevisions: 3, latestSubmittedAt: created.body.submission.submittedAt })
    const list = await (await loginAgent(a2)).get(`/api/teams/${alpha.id}/milestones`)
    expect(list.body.items.find((x: { id: number }) => x.id === m.id)).toMatchObject({ revisionsUsed: 1 })
  })

  it('TEST-02-01 submission part (AC-02-1): submission routes need a session', async () => {
    for (const res of [await request(app).get('/api/milestones/1/submissions'), await request(app).post('/api/milestones/1/submissions').send(work())]) {
      expect(res.status).toBe(401)
      expect(Object.keys(res.body)).toEqual(['error'])
    }
  })
})

describe('data integrity (additional case for AC-05-1): a submission belongs to its milestone\'s team', () => {
  it('the database rejects a submission whose teamId differs from its milestone\'s team; the matching team is accepted', async () => {
    const m = await milestone()
    const data = { milestoneId: m.id, revision: 1, title: 'Direct', link: 'https://example.com/x', submittedById: a1.id, submittedAt: new Date() }
    await expect(prisma.submission.create({ data: { ...data, teamId: beta.id } })).rejects.toThrow()
    expect(await count(m.id)).toBe(0)
    expect((await prisma.submission.create({ data: { ...data, teamId: alpha.id } })).teamId).toBe(alpha.id)
  })
})
