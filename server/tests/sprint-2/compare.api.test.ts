import { randomBytes } from 'node:crypto'
import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { cleanupTeams, createTeam } from '../helpers/teams'
import { cleanupUsers, createUser, loginAgent, type TestUser } from '../helpers/users'

// F-07 Revision history and comparison (FR-11), API level:
// GET /api/milestones/:milestoneId/compare?a=&b=
// Sprint 2 STS TEST-07-03 … TEST-07-07 (AC-07-1, 07-2, 07-4 … 07-6, 07-9).

const tag = () => randomBytes(4).toString('hex')
let a1: TestUser, b1: TestUser, sup1: TestUser, sup2: TestUser
let alpha: { id: number }
let milestone: { id: number }, other: { id: number }
let title: string
const milestones: number[] = []

async function milestoneWith(name: string, revisions: { title: string; link: string; description: string }[]) {
  const m = await prisma.milestone.create({
    data: { teamId: alpha.id, title: name, description: '', deadline: new Date(Date.now() + 72 * 3600000), maxRevisions: 5, createdById: sup1.id },
  })
  milestones.push(m.id)
  const base = Date.now() - 3600000
  for (const [i, r] of revisions.entries()) {
    await prisma.submission.create({
      data: { milestoneId: m.id, teamId: alpha.id, revision: i + 1, ...r, submittedById: a1.id, submittedAt: new Date(base + i * 60000) },
    })
  }
  return m
}

beforeAll(async () => {
  ;[a1, b1, sup1, sup2] = await Promise.all([createUser('STUDENT'), createUser('STUDENT'), createUser('SUPERVISOR'), createUser('SUPERVISOR')])
  alpha = await createTeam(`Team Alpha ${tag()}`, { members: [a1], supervisors: [sup1] })
  await createTeam(`Team Beta ${tag()}`, { members: [b1], supervisors: [sup2] })
  title = `Compare SRS ${tag()}`
  // TEST-07-03 / 07-04 milestone: revisions 1–3, equal titles on 1 and 3, different links, AC-07-3 descriptions.
  milestone = await milestoneWith(title, [
    { title: 'SRS', link: 'https://example.com/v1', description: 'Draft of the SRS' },
    { title: 'SRS second', link: 'https://example.com/v2', description: 'Second draft of the SRS' },
    { title: 'SRS', link: 'https://example.com/v3', description: 'Final draft of the SRS v2' },
  ])
  const revision1 = await prisma.submission.findUniqueOrThrow({ where: { milestoneId_revision: { milestoneId: milestone.id, revision: 1 } } })
  await prisma.feedback.create({ data: { submissionId: revision1.id, supervisorId: sup1.id, body: 'Add the use cases.' } })
  // TEST-07-07: a second Alpha milestone with revisions 1–5, descriptions of 2,000 characters on 1 and 2.
  const long = (seed: number) => Array.from({ length: 600 }, (_, i) => `w${(i * seed) % 97}`).join(' ').slice(0, 2000)
  other = await milestoneWith(`Long ${tag()}`, [1, 2, 3, 4, 5].map((n) => ({
    title: `Long v${n}`, link: `https://example.com/long${n}`, description: n === 1 ? long(7) : n === 2 ? long(11) : `text ${n}`,
  })))
})

afterAll(async () => {
  await prisma.feedback.deleteMany({ where: { submission: { milestoneId: { in: milestones } } } })
  await prisma.submission.deleteMany({ where: { milestoneId: { in: milestones } } })
  await prisma.milestone.deleteMany({ where: { id: { in: milestones } } })
  await cleanupTeams()
  await cleanupUsers()
  await prisma.$disconnect()
})

const compare = (agent: request.Agent | ReturnType<typeof request>, id: number | string, query: string) =>
  agent.get(`/api/milestones/${id}/compare${query}`)

describe('TEST-07-03 (AC-07-1, AC-07-2): compare two revisions', () => {
  it('A1 and Supervisor 1 get older = revision 1 with its feedback, newer = revision 3 without', async () => {
    for (const user of [a1, sup1]) {
      const res = await compare(await loginAgent(user), milestone.id, '?a=1&b=3')
      expect(res.status).toBe(200)
      const { comparison } = res.body
      expect(comparison.milestoneId).toBe(milestone.id)
      expect(comparison.older).toEqual({
        id: expect.any(Number), revision: 1, title: 'SRS', description: 'Draft of the SRS', link: 'https://example.com/v1',
        submittedAt: expect.any(String), submittedBy: { id: a1.id, name: a1.name },
        feedback: { id: expect.any(Number), submissionId: comparison.older.id, body: 'Add the use cases.', createdAt: expect.any(String), supervisor: { id: sup1.id, name: sup1.name } },
      })
      expect(comparison.newer).toMatchObject({ revision: 3, title: 'SRS', link: 'https://example.com/v3', feedback: null })
    }
  })

  it('the revisions use exactly the F-05 list item shape', async () => {
    const agent = await loginAgent(a1)
    const list = (await agent.get(`/api/milestones/${milestone.id}/submissions`)).body.items
    const { comparison } = (await compare(agent, milestone.id, '?a=1&b=3')).body
    expect(comparison.older).toEqual(list.find((s: { revision: number }) => s.revision === 1))
    expect(comparison.newer).toEqual(list.find((s: { revision: number }) => s.revision === 3))
  })

  it('a=3&b=1 returns the same body as a=1&b=3', async () => {
    const agent = await loginAgent(a1)
    const forward = await compare(agent, milestone.id, '?a=1&b=3')
    const reversed = await compare(agent, milestone.id, '?a=3&b=1')
    expect(reversed.status).toBe(200)
    expect(reversed.body).toEqual(forward.body)
  })
})

describe('TEST-07-04 (AC-07-3): the changes', () => {
  it('equal titles, different links, and the documented description parts', async () => {
    const { comparison } = (await compare(await loginAgent(a1), milestone.id, '?a=1&b=3')).body
    expect(comparison.changes).toEqual({
      title: { changed: false },
      link: { changed: true },
      description: {
        changed: true,
        parts: [
          { op: 'removed', text: 'Draft' },
          { op: 'added', text: 'Final draft' },
          { op: 'same', text: ' of the SRS' },
          { op: 'added', text: ' v2' },
        ],
      },
    })
  })
})

describe('TEST-07-05 (AC-07-4): query validation', () => {
  it.each([
    ['?b=3', ['a']],
    ['?a=1', ['b']],
    ['?a=0&b=3', ['a']],
    ['?a=abc&b=3', ['a']],
    ['?a=01&b=3', ['a']],
    ['?a=1e0&b=3', ['a']],
    ['?a=2147483648&b=3', ['a']],
    ['?a=2&b=2', ['b']],
  ])('%s → 400 naming %j', async (query, names) => {
    const res = await compare(await loginAgent(a1), milestone.id, query)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.message).toBe('Please correct the highlighted fields.')
    expect(Object.keys(res.body.error.fields)).toEqual(names)
  })
})

describe('TEST-07-06 (AC-07-5): scope', () => {
  it('Supervisor 2 and B1 get 404 "Milestone not found." with no Alpha title', async () => {
    for (const user of [sup2, b1]) {
      const res = await compare(await loginAgent(user), milestone.id, '?a=1&b=3')
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Milestone not found.' } })
      expect(res.text).not.toContain(title)
      expect(res.text).not.toContain('Draft of the SRS')
    }
  })

  it('scope is checked before the query: an outsider with a bad query still gets 404', async () => {
    const res = await compare(await loginAgent(b1), milestone.id, '?a=abc')
    expect(res.status).toBe(404)
  })

  it.each([['999999'], ['abc'], ['0']])('milestone ID %s → 404', async (id) => {
    const res = await compare(await loginAgent(sup1), id, '?a=1&b=3')
    expect(res.status).toBe(404)
    expect(res.body.error.message).toBe('Milestone not found.')
  })

  it('without a session → 401', async () => {
    const res = await compare(request(app), milestone.id, '?a=1&b=3')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })
})

describe('TEST-07-07 (AC-07-6, AC-07-9): revision existence and read-only', () => {
  it('a revision that does not exist, or exists only in another milestone, is 404 "Revision not found."', async () => {
    const agent = await loginAgent(a1)
    for (const query of ['?a=1&b=9', '?a=1&b=5']) {
      const res = await compare(agent, milestone.id, query)
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Revision not found.' } })
    }
  })

  it('two 2,000-character descriptions compare inside the NFR-08 budget, and nothing changes', async () => {
    const snapshot = async () => ({
      submissions: await prisma.submission.findMany({ where: { milestoneId: { in: milestones } }, select: { id: true, submittedAt: true, description: true }, orderBy: { id: 'asc' } }),
      feedback: await prisma.feedback.count(),
      milestones: await prisma.milestone.findMany({ where: { id: { in: milestones } }, orderBy: { id: 'asc' } }),
    })
    const before = await snapshot()
    const agent = await loginAgent(sup1)
    const started = performance.now()
    const res = await compare(agent, other.id, '?a=1&b=2')
    const elapsed = performance.now() - started
    expect(res.status).toBe(200)
    expect(res.body.comparison.older.description).toHaveLength(2000)
    expect(res.body.comparison.changes.description.changed).toBe(true)
    // NFR-08 budget is 2 s for a list/detail response; logged for the DoD.
    console.log(`TEST-07-07 timing: compare of two 2,000-character descriptions took ${elapsed.toFixed(0)} ms`)
    expect(elapsed).toBeLessThan(2000)
    for (let i = 0; i < 5; i++) await compare(agent, milestone.id, '?a=1&b=3')
    expect(await snapshot()).toEqual(before)
  })
})
