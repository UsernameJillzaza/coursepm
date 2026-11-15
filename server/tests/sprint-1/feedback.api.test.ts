import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { cleanupTeams, createTeam } from '../helpers/teams'
import { cleanupUsers, createUser, loginAgent, type TestUser } from '../helpers/users'

let a1: TestUser, a2: TestUser, b1: TestUser, sup1: TestUser, sup2: TestUser
let alpha: { id: number }, beta: { id: number }
let milestone: { id: number }, revision1: { id: number }

const endpoint = (id: number | string) => `/api/submissions/${id}/feedback`

beforeAll(async () => {
  ;[a1, a2, b1, sup1, sup2] = await Promise.all([
    createUser('STUDENT'), createUser('STUDENT'), createUser('STUDENT'),
    createUser('SUPERVISOR'), createUser('SUPERVISOR'),
  ])
  alpha = await createTeam('Team Alpha', { members: [a1, a2], supervisors: [sup1] })
  beta = await createTeam('Team Beta', { members: [b1], supervisors: [sup2] })
})

beforeEach(async () => {
  milestone = await prisma.milestone.create({
    data: { teamId: alpha.id, title: 'Proposal', description: '', deadline: new Date(Date.now() + 48 * 3600000), maxRevisions: 3, createdById: sup1.id },
  })
  revision1 = await prisma.submission.create({
    data: { milestoneId: milestone.id, teamId: alpha.id, revision: 1, title: 'Proposal v1', description: '', link: 'https://example.com/v1', submittedById: a1.id, submittedAt: new Date() },
  })
})

afterEach(async () => {
  await prisma.feedback.deleteMany({ where: { submission: { milestoneId: milestone.id } } })
  await prisma.submission.deleteMany({ where: { milestoneId: milestone.id } })
  await prisma.milestone.delete({ where: { id: milestone.id } })
})

afterAll(async () => {
  await cleanupTeams()
  await cleanupUsers()
  await prisma.$disconnect()
})

describe('F-06 feedback API', () => {
  it('TEST-06-01 (AC-06-1): an assigned supervisor records trimmed feedback on revision 1', async () => {
    const res = await (await loginAgent(sup1)).post(endpoint(revision1.id)).send({ body: '  Looks good.  ', supervisorId: sup2.id, submissionId: 999 })
    expect(res.status).toBe(201)
    expect(Object.keys(res.body.feedback).sort()).toEqual(['body', 'createdAt', 'id', 'submissionId', 'supervisor'])
    expect(res.body.feedback).toMatchObject({
      id: expect.any(Number), submissionId: revision1.id, body: 'Looks good.',
      supervisor: { id: sup1.id, name: sup1.name },
    })
    expect(Object.keys(res.body.feedback.supervisor).sort()).toEqual(['id', 'name'])
    expect(Number.isFinite(Date.parse(res.body.feedback.createdAt))).toBe(true)
    const stored = await prisma.feedback.findUniqueOrThrow({ where: { submissionId: revision1.id } })
    expect(stored.supervisorId).toBe(sup1.id)
    expect(stored.body).toBe('Looks good.')
  })

  it('TEST-06-02 / TEST-02-05 (AC-06-2, AC-02-5): a student in scope gets 403 before validation and stores nothing', async () => {
    const res = await (await loginAgent(a1)).post(endpoint(revision1.id)).send({ body: '' })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
    expect(await prisma.feedback.count({ where: { submissionId: revision1.id } })).toBe(0)
  })

  it('TEST-06-03 (AC-06-3): an unassigned supervisor or student gets 404 before role or validation', async () => {
    for (const user of [sup2, b1]) {
      const res = await (await loginAgent(user)).post(endpoint(revision1.id)).send({ body: '' })
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
      expect(res.text).not.toContain('Proposal')
    }
    expect(await prisma.feedback.count({ where: { submissionId: revision1.id } })).toBe(0)
  })

  it('TEST-06-04 / TEST-05-09 (AC-06-4, AC-05-7): feedback stays with revision 1 after revision 2', async () => {
    const feedback = await (await loginAgent(sup1)).post(endpoint(revision1.id)).send({ body: 'Revise the introduction.' })
    expect(feedback.status).toBe(201)
    const second = await (await loginAgent(a2)).post(`/api/milestones/${milestone.id}/submissions`).send({
      title: 'Proposal v2', description: '', link: 'https://example.com/v2',
    })
    expect(second.status).toBe(201)
    expect(second.body.submission.revision).toBe(2)

    const studentAgent = await loginAgent(a1)
    for (let i = 0; i < 2; i++) {
      const list = await studentAgent.get(`/api/milestones/${milestone.id}/submissions`)
      expect(list.status).toBe(200)
      expect(list.body.items.map((item: { revision: number }) => item.revision)).toEqual([2, 1])
      expect(list.body.items[0].feedback).toBeNull()
      expect(list.body.items[1].feedback).toEqual(feedback.body.feedback)
      expect(list.text).not.toMatch(/passwordHash|@test\.local/)
    }
  })

  it('TEST-06-05 (AC-06-5): a second POST returns 409 and leaves the original feedback unchanged', async () => {
    const agent = await loginAgent(sup1)
    const first = await agent.post(endpoint(revision1.id)).send({ body: 'First review' })
    const second = await agent.post(endpoint(revision1.id)).send({ body: 'Overwrite attempt' })
    expect(first.status).toBe(201)
    expect(second.status).toBe(409)
    expect(second.body.error.code).toBe('FEEDBACK_EXISTS')
    const rows = await prisma.feedback.findMany({ where: { submissionId: revision1.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].body).toBe('First review')
  })

  it('two simultaneous first POSTs produce exactly one feedback and one FEEDBACK_EXISTS', async () => {
    const [agent1, agent2] = await Promise.all([loginAgent(sup1), loginAgent(sup1)])
    const results = await Promise.all([
      agent1.post(endpoint(revision1.id)).send({ body: 'Review A' }),
      agent2.post(endpoint(revision1.id)).send({ body: 'Review B' }),
    ])
    expect(results.map((res) => res.status).sort()).toEqual([201, 409])
    expect(results.find((res) => res.status === 409)?.body.error.code).toBe('FEEDBACK_EXISTS')
    expect(await prisma.feedback.count({ where: { submissionId: revision1.id } })).toBe(1)
  })

  it('TEST-06-06 (AC-06-5): empty, whitespace-only and 4,001-character bodies get 400; 4,000 is accepted', async () => {
    const agent = await loginAgent(sup1)
    for (const payload of [{ body: '' }, { body: '   ' }, { body: 'x'.repeat(4001) }, {}]) {
      const res = await agent.post(endpoint(revision1.id)).send(payload)
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.fields).toHaveProperty('body')
    }
    expect(await prisma.feedback.count({ where: { submissionId: revision1.id } })).toBe(0)
    const accepted = await agent.post(endpoint(revision1.id)).send({ body: 'x'.repeat(4000) })
    expect(accepted.status).toBe(201)
  })

  it('TEST-02-01 feedback part (AC-02-1): requires a session; missing and malformed submission IDs return 404 in the standard shape', async () => {
    const noSession = await request(app).post(endpoint(revision1.id)).send({ body: 'Review' })
    expect(noSession.status).toBe(401)
    expect(Object.keys(noSession.body)).toEqual(['error'])
    const agent = await loginAgent(sup1)
    for (const id of ['abc', '0', '999999999']) {
      const res = await agent.post(endpoint(id)).send({ body: 'Review' })
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    }
  })
})
