import { prisma } from '../../src/db'
import { cleanupTeams, createTeam } from '../helpers/teams'
import { cleanupUsers, createUser, loginAgent, type TestUser } from '../helpers/users'

// F-08 through the API and the real database (contract
// docs/sprints/sprint-2/F-08-milestone-maintenance.md): STS TEST-08-01, -02,
// -04, -05, -06, -08 … -13, -16, -17.
let a1: TestUser, b1: TestUser, sup1: TestUser, sup2: TestUser
let alpha: { id: number }, beta: { id: number }
type Agent = Awaited<ReturnType<typeof loginAgent>>
let asA1: Agent, asSup1: Agent, asSup2: Agent

const hours = (n: number) => new Date(Date.now() + n * 3_600_000)
const work = { title: 'Proposal v1', description: '', link: 'https://github.com/example/p/pull/1' }

// Milestones, revisions and feedback are inserted directly so tests can use
// past deadlines and set preconditions the API refuses to create (STS note).
const milestone = (over: { deadline?: Date; maxRevisions?: number; teamId?: number; description?: string } = {}) =>
  prisma.milestone.create({
    data: {
      teamId: over.teamId ?? alpha.id,
      title: 'M',
      description: over.description ?? 'Original text',
      deadline: over.deadline ?? hours(48),
      maxRevisions: over.maxRevisions ?? 3,
      createdById: sup1.id,
    },
  })
const revision = (m: { id: number; teamId: number }, n: number, at = new Date()) =>
  prisma.submission.create({
    data: { milestoneId: m.id, teamId: m.teamId, revision: n, ...work, submittedById: a1.id, submittedAt: at },
  })
const feedbackOn = (submissionId: number) =>
  prisma.feedback.create({ data: { submissionId, supervisorId: sup1.id, body: 'Looks good' } })
const changes = (milestoneId: number) => prisma.milestoneChange.count({ where: { milestoneId } })
const extensions = (milestoneId: number) => prisma.deadlineExtension.count({ where: { milestoneId } })

beforeAll(async () => {
  ;[a1, b1, sup1, sup2] = await Promise.all([
    createUser('STUDENT'),
    createUser('STUDENT'),
    createUser('SUPERVISOR'),
    createUser('SUPERVISOR'),
  ])
  alpha = await createTeam('Team Alpha', { members: [a1], supervisors: [sup1] })
  beta = await createTeam('Team Beta', { members: [b1], supervisors: [sup2] })
  ;[asA1, asSup1, asSup2] = await Promise.all([loginAgent(a1), loginAgent(sup1), loginAgent(sup2)])
})
afterEach(() => {
  vi.useRealTimers()
})
afterAll(async () => {
  // Foreign keys are RESTRICT, so the test data is removed child-first.
  const teamIds = [alpha.id, beta.id]
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

describe('PATCH /api/milestones/:id (FR-12 edit)', () => {
  it('TEST-08-01 (AC-08-1): edits description + deadline, writes one audit row per changed field', async () => {
    const m = await milestone()
    const newDeadline = new Date(m.deadline.getTime() + 3 * 86_400_000)
    const res = await asSup1.patch(`/api/milestones/${m.id}`).send({ description: 'Clarified text', deadline: newDeadline.toISOString() })
    expect(res.status).toBe(200)
    expect(res.body.milestone).toMatchObject({ id: m.id, description: 'Clarified text', deadline: newDeadline.toISOString(), extended: false, closedAt: null })

    const fresh = await asA1.get(`/api/milestones/${m.id}`)
    expect(fresh.body.milestone).toMatchObject({ description: 'Clarified text', deadline: newDeadline.toISOString() })
    const rows = await prisma.milestoneChange.findMany({ where: { milestoneId: m.id }, orderBy: { field: 'asc' } })
    expect(rows.map((r) => [r.kind, r.field, r.oldValue, r.newValue, r.changedById])).toEqual([
      ['EDIT', 'deadline', m.deadline.toISOString(), newDeadline.toISOString(), sup1.id],
      ['EDIT', 'description', 'Original text', 'Clarified text', sup1.id],
    ])

    // One changed and one unchanged field → exactly one more row.
    const again = await asSup1.patch(`/api/milestones/${m.id}`).send({ description: 'Third text', deadline: newDeadline.toISOString() })
    expect(again.status).toBe(200)
    expect(await changes(m.id)).toBe(3)
  })

  it('TEST-08-02 (AC-08-2): no edit after a submission, an extension or the deadline; at exactly the deadline it is allowed', async () => {
    const withSub = await milestone()
    await revision(withSub, 1)
    const withExt = await milestone()
    expect((await asSup1.post(`/api/milestones/${withExt.id}/extensions`).send({ newDeadline: hours(72).toISOString(), reason: 'More time' })).status).toBe(201)
    const past = await milestone({ deadline: hours(-1) })
    const cases: [number, string][] = [[withSub.id, 'MILESTONE_HAS_SUBMISSIONS'], [withExt.id, 'MILESTONE_EXTENDED'], [past.id, 'DEADLINE_PASSED']]
    for (const [id, code] of cases) {
      const before = await prisma.milestone.findUniqueOrThrow({ where: { id } })
      const nChanges = await changes(id)
      for (const body of [{ description: 'Changed' }, { deadline: hours(96).toISOString() }]) {
        const res = await asSup1.patch(`/api/milestones/${id}`).send(body)
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe(code)
      }
      expect(await prisma.milestone.findUniqueOrThrow({ where: { id } })).toEqual(before)
      expect(await changes(id)).toBe(nChanges)
    }

    // Boundary (D-05, inclusive deadline): only Date is faked, so I/O still runs.
    const d = await milestone({ deadline: hours(1) })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(d.deadline)
    expect((await asSup1.patch(`/api/milestones/${d.id}`).send({ description: 'At the deadline' })).status).toBe(200)
    vi.setSystemTime(new Date(d.deadline.getTime() + 1))
    const late = await asSup1.patch(`/api/milestones/${d.id}`).send({ description: 'One ms late' })
    expect(late.status).toBe(409)
    expect(late.body.error.code).toBe('DEADLINE_PASSED')
  })

  it('TEST-08-04 (AC-08-3): field errors come together; stored values give NO_CHANGE; nothing is stored', async () => {
    const m = await milestone()
    const bad = await asSup1.patch(`/api/milestones/${m.id}`).send({ deadline: hours(-2).toISOString(), description: 'x'.repeat(2001) })
    expect(bad.status).toBe(400)
    expect(bad.body.error.code).toBe('VALIDATION_ERROR')
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(['deadline', 'description'])
    const same = await asSup1.patch(`/api/milestones/${m.id}`).send({ description: m.description, deadline: m.deadline.toISOString() })
    expect(same.status).toBe(400)
    expect(same.body.error).toEqual({ code: 'NO_CHANGE', message: 'Nothing to change.' })
    expect(await changes(m.id)).toBe(0)
  })
})

describe('Access (AC-08-4)', () => {
  it('TEST-08-05: a student gets 403, another team\'s supervisor 404, malformed IDs 404; nothing is stored', async () => {
    const m = await milestone()
    const calls = (agent: Agent, id: string) => [
      agent.patch(`/api/milestones/${id}`).send({ description: 'Hacked' }),
      agent.post(`/api/milestones/${id}/extensions`).send({ newDeadline: hours(96).toISOString(), reason: 'Because' }),
      agent.post(`/api/milestones/${id}/close`).send({}),
    ]
    for (const res of await Promise.all(calls(asA1, String(m.id)))) {
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    }
    for (const res of await Promise.all(calls(asSup2, String(m.id)))) expect(res.status).toBe(404)
    for (const id of ['abc', '0']) for (const res of await Promise.all(calls(asSup1, id))) expect(res.status).toBe(404)
    const after = await prisma.milestone.findUniqueOrThrow({ where: { id: m.id } })
    expect(after).toMatchObject({ description: 'Original text', deadline: m.deadline, closedAt: null })
    expect(await changes(m.id)).toBe(0)
    expect(await extensions(m.id)).toBe(0)
  })
})

describe('POST /api/milestones/:id/extensions (FR-13, BR-11)', () => {
  it('TEST-08-06 (AC-08-5): extends; a second extension chains previousDeadline and keeps originalDeadline', async () => {
    const m = await milestone()
    const d2 = new Date(m.deadline.getTime() + 2 * 86_400_000)
    const res = await asSup1.post(`/api/milestones/${m.id}/extensions`).send({ newDeadline: d2.toISOString(), reason: 'Server outage' })
    expect(res.status).toBe(201)
    expect(Object.keys(res.body.extension).sort()).toEqual(['grantedAt', 'grantedBy', 'id', 'milestoneId', 'newDeadline', 'previousDeadline', 'reason'])
    expect(res.body.extension).toMatchObject({
      milestoneId: m.id, previousDeadline: m.deadline.toISOString(), newDeadline: d2.toISOString(), reason: 'Server outage', grantedBy: { id: sup1.id, name: sup1.name },
    })
    expect(res.body.milestone).toMatchObject({ deadline: d2.toISOString(), originalDeadline: m.deadline.toISOString(), extended: true })

    const d3 = new Date(d2.getTime() + 86_400_000)
    expect((await asSup1.post(`/api/milestones/${m.id}/extensions`).send({ newDeadline: d3.toISOString(), reason: 'Still down' })).status).toBe(201)
    const rows = await prisma.deadlineExtension.findMany({ where: { milestoneId: m.id }, orderBy: { id: 'asc' } })
    expect(rows.map((r) => [r.previousDeadline.toISOString(), r.newDeadline.toISOString()])).toEqual([
      [m.deadline.toISOString(), d2.toISOString()],
      [d2.toISOString(), d3.toISOString()],
    ])
    const list = await asA1.get(`/api/teams/${alpha.id}/milestones`)
    expect(list.body.items.find((i: { id: number }) => i.id === m.id)).toMatchObject({ deadline: d3.toISOString(), originalDeadline: m.deadline.toISOString(), extended: true })
  })

  it('TEST-08-08 (AC-08-6): BR-11 boundary on a future deadline; a past deadline needs a future new one', async () => {
    const m = await milestone()
    const ext = (id: number, at: Date, reason = 'Valid reason') => asSup1.post(`/api/milestones/${id}/extensions`).send({ newDeadline: at.toISOString(), reason })
    for (const at of [m.deadline, new Date(m.deadline.getTime() - 1)]) {
      const res = await ext(m.id, at)
      expect(res.status).toBe(400)
      expect(Object.keys(res.body.error.fields)).toEqual(['newDeadline'])
    }
    const both = await ext(m.id, m.deadline, 'ab')
    expect(both.status).toBe(400)
    expect(Object.keys(both.body.error.fields).sort()).toEqual(['reason'])
    expect(await extensions(m.id)).toBe(0)
    expect((await ext(m.id, new Date(m.deadline.getTime() + 1))).status).toBe(201)

    const p = await milestone({ deadline: hours(-48) })
    const between = await ext(p.id, hours(-24))
    expect(between.status).toBe(400)
    expect(between.body.error.fields).toHaveProperty('newDeadline')
  })

  it('TEST-08-09 (AC-08-7): late work only through an extension (feedback on revision 1 already given)', async () => {
    const m = await milestone({ deadline: hours(-1) })
    await feedbackOn((await revision(m, 1, hours(-2))).id)
    const first = await asA1.post(`/api/milestones/${m.id}/submissions`).send(work)
    expect(first.status).toBe(409)
    expect(first.body.error.code).toBe('DEADLINE_PASSED')
    expect((await asSup1.post(`/api/milestones/${m.id}/extensions`).send({ newDeadline: hours(24).toISOString(), reason: 'Illness' })).status).toBe(201)
    const second = await asA1.post(`/api/milestones/${m.id}/submissions`).send(work)
    expect(second.status).toBe(201)
    expect(second.body.submission.revision).toBe(2)
  })

  it('TEST-08-17 (AC-08-11 b): two extensions to the same deadline at once → one 201, one 400, one row', async () => {
    const m = await milestone()
    const target = new Date(m.deadline.getTime() + 86_400_000).toISOString()
    const results = await Promise.all([1, 2].map(() => asSup1.post(`/api/milestones/${m.id}/extensions`).send({ newDeadline: target, reason: 'Same time' })))
    expect(results.map((r) => r.status).sort()).toEqual([201, 400])
    expect(results.find((r) => r.status === 400)!.body.error.fields).toHaveProperty('newDeadline')
    expect(await extensions(m.id)).toBe(1)
    expect((await prisma.milestone.findUniqueOrThrow({ where: { id: m.id } })).deadline.toISOString()).toBe(target)
  })
})

describe('POST /api/milestones/:id/close (FR-12 close early)', () => {
  it('TEST-08-10 (AC-08-8): close stops submissions first; repeats get MILESTONE_CLOSED; feedback still works', async () => {
    const m = await milestone()
    const r1 = await revision(m, 1)
    const closed = await asSup1.post(`/api/milestones/${m.id}/close`).send({ reason: 'Course ended' })
    expect(closed.status).toBe(200)
    expect(closed.body.milestone.status).toBe('CLOSED')
    expect(closed.body.milestone.closedAt).not.toBeNull()

    const submit = await asA1.post(`/api/milestones/${m.id}/submissions`).send(work)
    expect(submit.status).toBe(409)
    expect(submit.body.error.code).toBe('MILESTONE_CLOSED')
    expect(await prisma.submission.count({ where: { milestoneId: m.id } })).toBe(1)

    const valid = [
      asSup1.post(`/api/milestones/${m.id}/close`).send({}),
      asSup1.patch(`/api/milestones/${m.id}`).send({ description: 'Changed' }),
      asSup1.post(`/api/milestones/${m.id}/extensions`).send({ newDeadline: hours(96).toISOString(), reason: 'Valid reason' }),
    ]
    for (const res of await Promise.all(valid)) {
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('MILESTONE_CLOSED')
    }
    expect((await asSup1.post(`/api/submissions/${r1.id}/feedback`).send({ body: 'Final notes' })).status).toBe(201)

    const full = await milestone({ maxRevisions: 1 })
    await revision(full, 1)
    await asSup1.post(`/api/milestones/${full.id}/close`).send({})
    const fullSubmit = await asA1.post(`/api/milestones/${full.id}/submissions`).send(work)
    expect(fullSubmit.body.error.code).toBe('MILESTONE_CLOSED')

    const other = await milestone()
    for (const reason of ['x'.repeat(501), 'a\u0000b']) {
      const res = await asSup1.post(`/api/milestones/${other.id}/close`).send({ reason })
      expect(res.status).toBe(400)
      expect(res.body.error.fields).toHaveProperty('reason')
    }
    expect((await prisma.milestone.findUniqueOrThrow({ where: { id: other.id } })).closedAt).toBeNull()
  })
})

describe('Database CHECKs (AC-08-9)', () => {
  it('TEST-08-11: an extension that is not later, or has a 2-character reason, is rejected', async () => {
    const m = await milestone()
    const base = { milestoneId: m.id, previousDeadline: m.deadline, grantedById: sup1.id, grantedAt: new Date() }
    await expect(prisma.deadlineExtension.create({ data: { ...base, newDeadline: m.deadline, reason: 'Valid reason' } })).rejects.toThrow()
    await expect(prisma.deadlineExtension.create({ data: { ...base, newDeadline: hours(96), reason: 'ab' } })).rejects.toThrow()
    expect(await extensions(m.id)).toBe(0)
  })

  it('TEST-08-16: MilestoneChange kind rules and the closed pair are enforced', async () => {
    const m = await milestone()
    const row = { milestoneId: m.id, changedById: sup1.id, changedAt: new Date() }
    const bad = [
      { kind: 'EDIT' as const, field: null, oldValue: 'a', newValue: 'b' },
      { kind: 'EDIT' as const, field: 'title', oldValue: 'a', newValue: 'b' },
      { kind: 'EDIT' as const, field: 'description', oldValue: 'a', newValue: null },
      { kind: 'EDIT' as const, field: 'description', oldValue: 'a', newValue: 'b', reason: 'why' },
      { kind: 'CLOSE' as const, field: 'deadline' },
      { kind: 'CLOSE' as const, oldValue: 'a' },
      { kind: 'CLOSE' as const, reason: 'x'.repeat(501) },
    ]
    for (const data of bad) await expect(prisma.milestoneChange.create({ data: { ...row, ...data } })).rejects.toThrow()
    expect(await changes(m.id)).toBe(0)
    await expect(prisma.milestone.update({ where: { id: m.id }, data: { closedAt: new Date() } })).rejects.toThrow()
  })
})

describe('GET /api/milestones/:id/history (AC-08-10)', () => {
  it('TEST-08-12: EDIT, EXTENSION and CLOSE newest first for A1 and Supervisor 1; 404 for Supervisor 2', async () => {
    const m = await milestone()
    expect((await asSup1.patch(`/api/milestones/${m.id}`).send({ description: 'Edited' })).status).toBe(200)
    const newDeadline = hours(96)
    expect((await asSup1.post(`/api/milestones/${m.id}/extensions`).send({ newDeadline: newDeadline.toISOString(), reason: 'Lab closed' })).status).toBe(201)
    expect((await asSup1.post(`/api/milestones/${m.id}/close`).send({ reason: 'Done' })).status).toBe(200)

    for (const agent of [asA1, asSup1]) {
      const res = await agent.get(`/api/milestones/${m.id}/history`)
      expect(res.status).toBe(200)
      expect(res.body.items.map((i: { kind: string }) => i.kind)).toEqual(['CLOSE', 'EXTENSION', 'EDIT'])
      expect(res.body.items[0]).toMatchObject({ kind: 'CLOSE', field: null, oldValue: null, newValue: null, reason: 'Done', by: { id: sup1.id, name: sup1.name } })
      expect(res.body.items[1]).toMatchObject({ kind: 'EXTENSION', field: 'deadline', oldValue: m.deadline.toISOString(), newValue: newDeadline.toISOString(), reason: 'Lab closed' })
      expect(res.body.items[2]).toMatchObject({ kind: 'EDIT', field: 'description', oldValue: 'Original text', newValue: 'Edited', reason: null })
      for (const item of res.body.items) expect(Object.keys(item).sort()).toEqual(['at', 'by', 'field', 'kind', 'newValue', 'oldValue', 'reason'])
    }
    expect((await asSup2.get(`/api/milestones/${m.id}/history`)).status).toBe(404)
  })
})

describe('Race: edit vs submission (AC-08-11 a)', () => {
  it('TEST-08-13: an edit never succeeds as if before a submission that already happened (20 runs)', async () => {
    for (let run = 0; run < 20; run++) {
      const m = await milestone()
      const [edit, submit] = await Promise.all([
        asSup1.patch(`/api/milestones/${m.id}`).send({ deadline: hours(72).toISOString() }),
        asA1.post(`/api/milestones/${m.id}/submissions`).send(work),
      ])
      const subs = await prisma.submission.findMany({ where: { milestoneId: m.id } })
      if (edit.status === 200) {
        const row = await prisma.milestoneChange.findFirstOrThrow({ where: { milestoneId: m.id } })
        if (submit.status === 201) expect(row.changedAt.getTime()).toBeLessThanOrEqual(subs[0].submittedAt.getTime())
      } else {
        expect(edit.status).toBe(409)
        expect(edit.body.error.code).toBe('MILESTONE_HAS_SUBMISSIONS')
        expect(subs).toHaveLength(1)
      }
      expect([200, 409]).toContain(edit.status)
      expect(submit.status).toBe(201)
    }
  })
})
