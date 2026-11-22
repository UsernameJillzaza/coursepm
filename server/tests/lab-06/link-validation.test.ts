import { prisma } from '../../src/db'
import { validateSubmission } from '../../src/rules/submission'
import { cleanupTeams, createTeam } from '../helpers/teams'
import { cleanupUsers, createUser, loginAgent, type TestUser } from '../helpers/users'

// Lab 6 regression tests for Issue #59 (partner UAT finding DEF-CP-03).
// BR-08 / AC-05-5: the link must be an absolute http(s) address. new URL()
// alone normalises "http:///path" to "http://path/" and drops newlines, so a
// link with no real host, or with whitespace inside it, was stored.

const valid = { title: 'Proposal v1', description: 'First draft', link: 'https://github.com/team/proj/pull/1' }

// The partner's inputs (CP-UAT-EX5) plus the same classes of problem.
const BAD_LINKS = [
  'http:///path',
  'http://.',
  'http://...',
  'https://example.com/a b',
  'https://example.com\nnewline',
  'https://exa mple.com/x',
  'https://example.com/\ttab',
  'https:/example.com/one-slash',
  'https:example.com',
  'http://.example.com/x',
  'http://example..com/x',
]

// Links that must keep working (regression guards).
const GOOD_LINKS = [
  'https://github.com/team/proj/pull/1',
  'http://example.com/report',
  'https://docs.google.com/document/d/abc/edit?usp=sharing#heading=h.1',
  'https://example.com/a%20b',
  'http://localhost:5173/teams/1',
  'https://192.168.1.10/report.pdf',
  'https://example.com./x',
  'HTTPS://EXAMPLE.COM/X',
  '  https://example.com/trimmed  ',
]

describe('TEST-L6-59-01 (BR-08, AC-05-5): validateSubmission rejects links without a real host or with whitespace', () => {
  it.each(BAD_LINKS)('rejects %j with a link field error', (link) => {
    const r = validateSubmission({ ...valid, link })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fields.link).toBeDefined()
  })

  it.each(GOOD_LINKS)('still accepts %j', (link) => {
    expect(validateSubmission({ ...valid, link }).ok).toBe(true)
  })
})

let student: TestUser, supervisor: TestUser
let team: { id: number }

beforeAll(async () => {
  student = await createUser('STUDENT')
  supervisor = await createUser('SUPERVISOR')
  team = await createTeam('Team Lab6 links', { members: [student], supervisors: [supervisor] })
})
afterAll(async () => {
  // Foreign keys are RESTRICT, so remove the test's rows child-first (as in
  // tests/sprint-1/submissions.api.test.ts).
  await prisma.submission.deleteMany({ where: { teamId: team.id } })
  await prisma.milestone.deleteMany({ where: { teamId: team.id } })
  await cleanupTeams()
  await cleanupUsers()
  await prisma.$disconnect()
})

describe('TEST-L6-59-02 (AC-05-5): the submission API answers 400 and stores nothing for these links', () => {
  it('rejects every partner input on an open milestone, then accepts a normal link', async () => {
    const m = await prisma.milestone.create({
      data: { teamId: team.id, title: 'Links', description: '', deadline: new Date(Date.now() + 48 * 3600_000), maxRevisions: 5, createdById: supervisor.id },
    })
    const agent = await loginAgent(student)
    for (const link of ['http:///path', 'http://.', 'http://...', 'https://example.com/a b', 'https://example.com\nnewline']) {
      const res = await agent.post(`/api/milestones/${m.id}/submissions`).send({ ...valid, link })
      expect({ link, status: res.status }).toEqual({ link, status: 400 })
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.fields).toHaveProperty('link')
    }
    expect(await prisma.submission.count({ where: { milestoneId: m.id } })).toBe(0)
    const ok = await agent.post(`/api/milestones/${m.id}/submissions`).send(valid)
    expect(ok.status).toBe(201)
    expect(ok.body.submission.revision).toBe(1)
  })
})
