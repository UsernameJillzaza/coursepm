import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { cleanupTeams, createTeam } from '../helpers/teams'
import { cleanupUsers, createUser, loginAgent, type TestUser } from '../helpers/users'

let student: TestUser, supervisor: TestUser, otherSupervisor: TestUser
let alpha: { id: number }, beta: { id: number }
const future = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const validBody = () => ({ title: 'Proposal', description: 'Draft the proposal', deadline: future(), maxRevisions: 3 })

beforeAll(async () => {
  ;[student, supervisor, otherSupervisor] = await Promise.all([
    createUser('STUDENT'), createUser('SUPERVISOR'), createUser('SUPERVISOR'),
  ])
  alpha = await createTeam('Team Alpha', { members: [student], supervisors: [supervisor] })
  beta = await createTeam('Team Beta', { supervisors: [otherSupervisor] })
})

afterEach(async () => {
  await prisma.milestone.deleteMany({ where: { teamId: { in: [alpha.id, beta.id] } } })
})

afterAll(async () => {
  await cleanupTeams()
  await cleanupUsers()
  await prisma.$disconnect()
})

describe('F-04 milestone API', () => {
  it('TEST-04-01 (AC-04-1): an assigned supervisor creates a milestone visible to their students', async () => {
    const supervisorAgent = await loginAgent(supervisor)
    const created = await supervisorAgent.post(`/api/teams/${alpha.id}/milestones`).send(validBody())
    expect(created.status).toBe(201)
    expect(created.body.milestone).toMatchObject({
      id: expect.any(Number), teamId: alpha.id, title: 'Proposal', maxRevisions: 3,
      createdById: supervisor.id, revisionsUsed: 0, status: 'OPEN', latestSubmittedAt: null,
    })
    const studentAgent = await loginAgent(student)
    const listed = await studentAgent.get(`/api/teams/${alpha.id}/milestones`)
    expect(listed.status).toBe(200)
    expect(listed.body.items).toHaveLength(1)
    expect(listed.body.items[0].id).toBe(created.body.milestone.id)

    const detail = await studentAgent.get(`/api/milestones/${created.body.milestone.id}`)
    expect(detail.status).toBe(200)
    expect(detail.body).toMatchObject({ milestone: { title: 'Proposal' }, team: { id: alpha.id, name: 'Team Alpha' } })
  })

  it('TEST-04-02 / TEST-02-04 (AC-04-2, AC-02-4): a student cannot create in their own team', async () => {
    const res = await (await loginAgent(student)).post(`/api/teams/${alpha.id}/milestones`).send(validBody())
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
    expect(await prisma.milestone.count({ where: { teamId: alpha.id } })).toBe(0)
  })

  it('TEST-04-03 / TEST-02-09 (AC-04-3, AC-02-9): scope precedes role and validation', async () => {
    const supervisorAgent = await loginAgent(supervisor)
    const outside = await supervisorAgent.post(`/api/teams/${beta.id}/milestones`).send({ title: 'x' })
    expect(outside.status).toBe(404)
    expect(outside.text).not.toContain('Team Beta')

    const studentAgent = await loginAgent(student)
    const own = await studentAgent.post(`/api/teams/${alpha.id}/milestones`).send(validBody())
    const outsideStudent = await studentAgent.post(`/api/teams/${beta.id}/milestones`).send(validBody())
    expect(own.status).toBe(403)
    expect(outsideStudent.status).toBe(404)
    expect(await prisma.milestone.count({ where: { teamId: { in: [alpha.id, beta.id] } } })).toBe(0)
  })

  it('TEST-04-05 (AC-04-4): invalid fields are combined, and boundary values are accepted', async () => {
    const agent = await loginAgent(supervisor)
    const invalid = await agent.post(`/api/teams/${alpha.id}/milestones`).send({
      title: 'ab', description: 'x'.repeat(2001), deadline: '2000-01-01T00:00:00.000Z', maxRevisions: 0,
    })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR')
    expect(Object.keys(invalid.body.error.fields).sort()).toEqual(['deadline', 'description', 'maxRevisions', 'title'])
    expect(await prisma.milestone.count({ where: { teamId: alpha.id } })).toBe(0)

    for (const [title, maxRevisions] of [['abc', 1], ['x'.repeat(120), 5]] as const) {
      const res = await agent.post(`/api/teams/${alpha.id}/milestones`).send({ ...validBody(), title, maxRevisions })
      expect(res.status).toBe(201)
      expect(res.body.milestone.title).toBe(title)
    }
  })

  it('TEST-04-06 (AC-04-5): lists milestones by deadline with derived status and empty revision fields', async () => {
    const dates = [
      new Date(Date.now() + 3 * 86400000),
      new Date(Date.now() - 86400000),
      new Date(Date.now() + 86400000),
    ]
    for (let i = 0; i < dates.length; i++) {
      await prisma.milestone.create({
        data: { teamId: alpha.id, title: `Milestone ${i}`, description: '', deadline: dates[i], maxRevisions: 3, createdById: supervisor.id },
      })
    }
    const res = await (await loginAgent(student)).get(`/api/teams/${alpha.id}/milestones`)
    expect(res.status).toBe(200)
    expect(res.body.items.map((m: { title: string }) => m.title)).toEqual(['Milestone 1', 'Milestone 2', 'Milestone 0'])
    expect(res.body.items.map((m: { status: string }) => m.status)).toEqual(['CLOSED', 'OPEN', 'OPEN'])
    expect(res.body.items.every((m: { revisionsUsed: number; latestSubmittedAt: null }) => m.revisionsUsed === 0 && m.latestSubmittedAt === null)).toBe(true)
  })

  it('the database CHECK rejects revision limits outside 1–5', async () => {
    await expect(prisma.milestone.create({
      data: { teamId: alpha.id, title: 'Invalid', description: '', deadline: new Date(future()), maxRevisions: 6, createdById: supervisor.id },
    })).rejects.toThrow()
  })

  it('new routes require a session and out-of-scope detail/list return 404', async () => {
    const created = await prisma.milestone.create({
      data: { teamId: beta.id, title: 'Beta secret', description: '', deadline: new Date(future()), maxRevisions: 3, createdById: otherSupervisor.id },
    })
    for (const path of [`/api/teams/${alpha.id}/milestones`, `/api/milestones/${created.id}`]) {
      const res = await request(app).get(path)
      expect(res.status).toBe(401)
      expect(Object.keys(res.body)).toEqual(['error'])
    }
    const noCookiePost = await request(app).post(`/api/teams/${alpha.id}/milestones`).send(validBody())
    expect(noCookiePost.status).toBe(401)

    const agent = await loginAgent(student)
    const list = await agent.get(`/api/teams/${beta.id}/milestones`)
    const detail = await agent.get(`/api/milestones/${created.id}`)
    expect(list.status).toBe(404)
    expect(detail.status).toBe(404)
    expect(list.text + detail.text).not.toContain('Beta secret')
    expect((await agent.get('/api/milestones/not-an-id')).status).toBe(404)
    expect((await agent.get('/api/teams/not-an-id/milestones')).status).toBe(404)
  })
})
