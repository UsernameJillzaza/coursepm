import { prisma } from '../../src/db'
import { validateFeedback } from '../../src/rules/feedback'
import { validateMilestone } from '../../src/rules/milestone'
import { validateSubmission } from '../../src/rules/submission'
import { cleanupTeams, createTeam } from '../helpers/teams'
import { cleanupUsers, createUser, loginAgent, type TestUser } from '../helpers/users'

// Lab 6 regression tests for Issue #63 (found by the Product Team while
// fixing #58, same root cause as DEF-CP-02). PostgreSQL rejects a NUL byte in
// a text parameter, so a NUL in a milestone, submission or feedback field
// returned 500. It must be an ordinary field error: 400 VALIDATION_ERROR
// naming the field (AC-04-4, AC-05-5, AC-06-2), with nothing stored.
// Single-line fields reject every control character; multi-line fields keep
// tab, line feed and carriage return.

// Built with fromCharCode so the source file itself contains no raw control bytes.
const NUL = String.fromCharCode(0)
const SOH = String.fromCharCode(1)
const DEL = String.fromCharCode(0x7f)

const future = () => new Date(Date.now() + 7 * 24 * 3600_000).toISOString()
const milestoneInput = () => ({ title: 'Design review', description: 'Bring the diagrams', deadline: future(), maxRevisions: 3 })
const submissionInput = { title: 'Proposal v1', description: 'First draft', link: 'https://example.com/proposal' }

describe('TEST-L6-63-01 (AC-04-4, AC-05-5, AC-06-2): rule functions reject control characters in text fields', () => {
  it.each([
    ['title', 'NUL', NUL], ['title', 'SOH', SOH], ['description', 'NUL', NUL], ['description', 'DEL', DEL],
  ])('milestone %s with %s', (field, _name, ch) => {
    const input = { ...milestoneInput(), [field]: `Text ${ch} here` }
    const r = validateMilestone(input, new Date())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.fields)).toEqual([field])
  })

  it.each([
    ['title', 'NUL', NUL], ['title', 'SOH', SOH], ['description', 'NUL', NUL], ['description', 'DEL', DEL],
  ])('submission %s with %s', (field, _name, ch) => {
    const r = validateSubmission({ ...submissionInput, [field]: `Text ${ch} here` })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.fields)).toEqual([field])
  })

  it.each([['NUL', NUL], ['SOH', SOH], ['DEL', DEL]])('feedback body with %s', (_name, ch) => {
    const r = validateFeedback({ body: `Good work ${ch} overall` })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.fields)).toEqual(['body'])
  })

  it('multi-line text keeps tab, line feed and carriage return', () => {
    const text = 'Line 1\r\nLine 2\n\tindented'
    expect(validateMilestone({ ...milestoneInput(), description: text }, new Date()).ok).toBe(true)
    expect(validateSubmission({ ...submissionInput, description: text }).ok).toBe(true)
    expect(validateFeedback({ body: text }).ok).toBe(true)
  })
})

let student: TestUser, supervisor: TestUser
let team: { id: number }

beforeAll(async () => {
  student = await createUser('STUDENT')
  supervisor = await createUser('SUPERVISOR')
  team = await createTeam('Team Lab6 text', { members: [student], supervisors: [supervisor] })
})
afterAll(async () => {
  // Foreign keys are RESTRICT, so remove the test's rows child-first.
  await prisma.feedback.deleteMany({ where: { submission: { teamId: team.id } } })
  await prisma.submission.deleteMany({ where: { teamId: team.id } })
  await prisma.milestone.deleteMany({ where: { teamId: team.id } })
  await cleanupTeams()
  await cleanupUsers()
  await prisma.$disconnect()
})

describe('TEST-L6-63-02 (AC-04-4, AC-05-5, AC-06-2): the API answers 400 naming the field and stores nothing', () => {
  it('POST /api/teams/:id/milestones with NUL in title or description', async () => {
    const agent = await loginAgent(supervisor)
    for (const field of ['title', 'description']) {
      const res = await agent.post(`/api/teams/${team.id}/milestones`).send({ ...milestoneInput(), [field]: `Bad ${NUL} text` })
      expect({ field, status: res.status }).toEqual({ field, status: 400 })
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.fields).toHaveProperty(field)
    }
    expect(await prisma.milestone.count({ where: { teamId: team.id } })).toBe(0)
  })

  it('POST /api/milestones/:id/submissions with NUL in title, description or link', async () => {
    const m = await prisma.milestone.create({
      data: { teamId: team.id, title: 'Open milestone', description: '', deadline: new Date(Date.now() + 48 * 3600_000), maxRevisions: 5, createdById: supervisor.id },
    })
    const agent = await loginAgent(student)
    for (const field of ['title', 'description', 'link']) {
      const value = field === 'link' ? `https://example.com/a${NUL}b` : `Bad ${NUL} text`
      const res = await agent.post(`/api/milestones/${m.id}/submissions`).send({ ...submissionInput, [field]: value })
      expect({ field, status: res.status }).toEqual({ field, status: 400 })
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.fields).toHaveProperty(field)
    }
    expect(await prisma.submission.count({ where: { milestoneId: m.id } })).toBe(0)
  })

  it('POST /api/submissions/:id/feedback with NUL in the body, then a multi-line body is saved', async () => {
    const m = await prisma.milestone.create({
      data: { teamId: team.id, title: 'Feedback milestone', description: '', deadline: new Date(Date.now() + 48 * 3600_000), maxRevisions: 5, createdById: supervisor.id },
    })
    const created = await (await loginAgent(student)).post(`/api/milestones/${m.id}/submissions`).send(submissionInput)
    expect(created.status).toBe(201)
    const submissionId = created.body.submission.id
    const agent = await loginAgent(supervisor)

    const bad = await agent.post(`/api/submissions/${submissionId}/feedback`).send({ body: `Bad ${NUL} feedback` })
    expect(bad.status).toBe(400)
    expect(bad.body.error.code).toBe('VALIDATION_ERROR')
    expect(bad.body.error.fields).toHaveProperty('body')
    expect(await prisma.feedback.count({ where: { submissionId } })).toBe(0)

    const good = await agent.post(`/api/submissions/${submissionId}/feedback`).send({ body: 'Line 1\nLine 2' })
    expect(good.status).toBe(201)
  })
})
