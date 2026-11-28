import { randomBytes } from 'node:crypto'
import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { cleanupTeams, createTeam } from '../helpers/teams'
import { cleanupUsers, createUser, loginAgent, type TestUser } from '../helpers/users'

// F-11 Milestone scoring and release (FR-16, BR-12, D-10), API level:
// GET / PUT /api/milestones/:milestoneId/score, POST …/score/release.
// Sprint 3 STS TEST-11-04 … TEST-11-11.

const tag = () => randomBytes(4).toString('hex')
const NUL = String.fromCharCode(0)
const REASON_REQUIRED = 'A reason (3–500 characters) is required to change a released score.'

let a1: TestUser, b1: TestUser, sup1: TestUser, sup2: TestUser, admin: TestUser
let alpha: { id: number }
const milestones: number[] = []

beforeAll(async () => {
  ;[a1, b1, sup1, sup2, admin] = await Promise.all([
    createUser('STUDENT'), createUser('STUDENT'), createUser('SUPERVISOR'), createUser('SUPERVISOR'), createUser('ADMIN'),
  ])
  alpha = await createTeam(`Team Alpha ${tag()}`, { members: [a1], supervisors: [sup1] })
  await createTeam(`Team Beta ${tag()}`, { members: [b1], supervisors: [sup2] })
})

afterAll(async () => {
  await prisma.scoreChange.deleteMany({ where: { milestoneScore: { milestoneId: { in: milestones } } } })
  await prisma.milestoneScore.deleteMany({ where: { milestoneId: { in: milestones } } })
  await prisma.milestoneChange.deleteMany({ where: { milestoneId: { in: milestones } } })
  await prisma.feedback.deleteMany({ where: { submission: { milestoneId: { in: milestones } } } })
  await prisma.submission.deleteMany({ where: { milestoneId: { in: milestones } } })
  await prisma.milestone.deleteMany({ where: { id: { in: milestones } } })
  await cleanupTeams()
  await cleanupUsers()
  await prisma.$disconnect()
})

async function milestone(over: { title?: string; deadline?: Date; closed?: boolean } = {}) {
  const m = await prisma.milestone.create({
    data: {
      teamId: alpha.id, title: over.title ?? `Score ${tag()}`, description: '', maxRevisions: 3, createdById: sup1.id,
      deadline: over.deadline ?? new Date(Date.now() + 72 * 3600000),
      ...(over.closed ? { closedAt: new Date(), closedById: sup1.id } : {}),
    },
  })
  milestones.push(m.id)
  return m
}

const path = (id: number | string) => `/api/milestones/${id}/score`
const put = async (user: TestUser, id: number | string, body: unknown) => (await loginAgent(user)).put(path(id)).send(body as object)
const release = async (user: TestUser, id: number | string) => (await loginAgent(user)).post(`${path(id)}/release`)
const get = async (user: TestUser, id: number | string) => (await loginAgent(user)).get(path(id))
const changeCount = (milestoneId: number) => prisma.scoreChange.count({ where: { milestoneScore: { milestoneId } } })
const storedScore = async (milestoneId: number) => (await prisma.milestoneScore.findUnique({ where: { milestoneId } }))?.score ?? null

describe('TEST-11-04 (AC-11-1): set and change before release', () => {
  it('PUT 85, PUT 90 without a reason, GET → value 90, not released, history 90 ← 85 ← —, no-store', async () => {
    const m = await milestone()
    const first = await put(sup1, m.id, { score: 85 })
    expect(first.status).toBe(200)
    expect(first.body.score).toMatchObject({ value: 85, releasedAt: null, releasedBy: null })
    expect(first.body.score.history).toEqual([
      { kind: 'SET', oldValue: null, newValue: 85, reason: null, by: { id: sup1.id, name: sup1.name }, at: expect.any(String) },
    ])
    expect((await put(sup1, m.id, { score: 90 })).status).toBe(200)

    const res = await get(sup1, m.id)
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body.score).toMatchObject({ value: 90, releasedAt: null, releasedBy: null })
    expect(res.body.score.history.map((h: { oldValue: number | null; newValue: number }) => [h.oldValue, h.newValue])).toEqual([[85, 90], [null, 85]])
    expect(res.body.score.history.every((h: { by: { id: number } }) => h.by.id === sup1.id)).toBe(true)
  })
})

describe('TEST-11-05 (AC-11-2): an unreleased score is in no student response', () => {
  it('A1 gets { score: null } for an unreleased and an unscored milestone, and no other response carries the value', async () => {
    const scored = await milestone({ title: `Hidden ${tag()}` })
    const unscored = await milestone()
    await put(sup1, scored.id, { score: 87 })
    // IDs can be any number, so look for the value under a score-like key, and for any score key at all.
    await prisma.submission.create({
      data: { milestoneId: scored.id, teamId: alpha.id, revision: 1, title: 'Work v1', description: '', link: 'https://example.com/v1', submittedById: a1.id, submittedAt: new Date() },
    })
    const agent = await loginAgent(a1)
    for (const id of [scored.id, unscored.id]) {
      const res = await agent.get(path(id))
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ score: null })
      expect(res.headers['cache-control']).toBe('no-store')
    }
    const bodies = [
      await agent.get(`/api/milestones/${scored.id}`),
      await agent.get(`/api/teams/${alpha.id}/milestones`),
      await agent.get(`/api/milestones/${scored.id}/submissions`),
      await agent.get(`/api/teams/${alpha.id}/board`), // F-10
    ]
    for (const res of bodies) {
      expect(res.status).toBe(200)
      expect(res.text).not.toMatch(/"score"/)
      expect(res.text).not.toMatch(/"(value|score|newScore)"\s*:\s*87/)
    }
  })
})

describe('TEST-11-06 (AC-11-3): release', () => {
  it('release → releasedAt and releasedBy; A1 sees only value + releasedAt; again → 409 ALREADY_RELEASED; no score → 409 NO_SCORE', async () => {
    const m = await milestone()
    const empty = await milestone()
    await put(sup1, m.id, { score: 90 })
    const res = await release(sup1, m.id)
    expect(res.status).toBe(200)
    expect(res.body.score).toMatchObject({ value: 90, releasedAt: expect.any(String), releasedBy: { id: sup1.id, name: sup1.name } })
    expect(res.body.score.history[0]).toMatchObject({ kind: 'RELEASE', oldValue: null, newValue: null, reason: null })

    const seen = await get(a1, m.id)
    expect(seen.body).toEqual({ score: { value: 90, releasedAt: res.body.score.releasedAt } })

    const changesBefore = await changeCount(m.id)
    const again = await release(sup1, m.id)
    expect(again.status).toBe(409)
    expect(again.body).toEqual({ error: { code: 'ALREADY_RELEASED', message: 'This score has already been released.' } })
    const none = await release(sup1, empty.id)
    expect(none.status).toBe(409)
    expect(none.body).toEqual({ error: { code: 'NO_SCORE', message: 'Set a score before releasing it.' } })
    expect(await changeCount(m.id)).toBe(changesBefore)
    expect(await prisma.milestoneScore.count({ where: { milestoneId: empty.id } })).toBe(0)
  })
})

describe('TEST-11-07 (AC-11-4): a released score changes only with a reason', () => {
  it('no / 2-char / spaces / NUL / 501-char reason → 400 fields.reason; a real reason → 200; A1 sees the new value with the original releasedAt', async () => {
    const m = await milestone()
    await put(sup1, m.id, { score: 90 })
    const released = await release(sup1, m.id)
    const releasedAt = released.body.score.releasedAt
    const before = await changeCount(m.id)

    for (const reason of [undefined, 'ab', '   ', `Regraded${NUL}`, 'r'.repeat(501)]) {
      const res = await put(sup1, m.id, { score: 70, ...(reason === undefined ? {} : { reason }) })
      expect({ reason: reason?.slice(0, 10), status: res.status, field: Object.keys(res.body.error?.fields ?? {}) }).toEqual({ reason: reason?.slice(0, 10), status: 400, field: ['reason'] })
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    }
    expect(await storedScore(m.id)).toBe(90)
    expect(await changeCount(m.id)).toBe(before)

    const ok = await put(sup1, m.id, { score: 70, reason: 'Regraded after appeal' })
    expect(ok.status).toBe(200)
    expect(ok.body.score.history[0]).toMatchObject({ kind: 'SET', oldValue: 90, newValue: 70, reason: 'Regraded after appeal' })
    expect(ok.body.score.releasedAt).toBe(releasedAt)
    const change = await prisma.scoreChange.findFirst({ where: { milestoneScore: { milestoneId: m.id } }, orderBy: { id: 'desc' } })
    expect(change).toMatchObject({ kind: 'SET', afterRelease: true, reason: 'Regraded after appeal' })

    expect((await get(a1, m.id)).body).toEqual({ score: { value: 70, releasedAt } })
  })

  it('reasons of exactly 3 and 500 characters are accepted after release', async () => {
    const m = await milestone()
    await put(sup1, m.id, { score: 50 })
    await release(sup1, m.id)
    expect((await put(sup1, m.id, { score: 51, reason: 'abc' })).status).toBe(200)
    expect((await put(sup1, m.id, { score: 52, reason: 'r'.repeat(500) })).status).toBe(200)
  })

  it('the released reason message is the documented one', async () => {
    const m = await milestone()
    await put(sup1, m.id, { score: 50 })
    await release(sup1, m.id)
    const res = await put(sup1, m.id, { score: 60 })
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fields: { reason: REASON_REQUIRED } })
  })
})

describe('TEST-11-08 (AC-11-5, AC-11-6): validation, roles and scope', () => {
  it('invalid scores → 400 fields.score; 0 and 100 accepted; the stored value again → 400 NO_CHANGE', async () => {
    const m = await milestone()
    for (const score of [-1, 101, 85.5, '85', null, undefined]) {
      const res = await put(sup1, m.id, score === undefined ? {} : { score })
      expect({ score, status: res.status, fields: res.body.error?.fields }).toEqual({ score, status: 400, fields: { score: 'Score must be a whole number from 0 to 100.' } })
    }
    expect(await prisma.milestoneScore.count({ where: { milestoneId: m.id } })).toBe(0)
    expect((await put(sup1, m.id, { score: 0 })).status).toBe(200)
    expect((await put(sup1, m.id, { score: 100 })).status).toBe(200)
    const same = await put(sup1, m.id, { score: 100 })
    expect(same.status).toBe(400)
    expect(same.body).toEqual({ error: { code: 'NO_CHANGE', message: 'The score already has this value.' } })
    expect(await changeCount(m.id)).toBe(2)
  })

  it('a student of the team → 403 on PUT and release; nothing stored', async () => {
    const m = await milestone()
    const putRes = await put(a1, m.id, { score: 80 })
    const relRes = await release(a1, m.id)
    for (const res of [putRes, relRes]) {
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Only an assigned supervisor can score this milestone.' } })
    }
    expect(await prisma.milestoneScore.count({ where: { milestoneId: m.id } })).toBe(0)
  })

  it('Supervisor 2, B1 and an ADMIN get 404 on GET, PUT and release; bad IDs → 404; no session → 401', async () => {
    const m = await milestone({ title: `Scope ${tag()}` })
    await put(sup1, m.id, { score: 77 })
    for (const user of [sup2, b1, admin]) {
      for (const res of [await get(user, m.id), await put(user, m.id, { score: 10 }), await release(user, m.id)]) {
        expect(res.status).toBe(404)
        expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Milestone not found.' } })
        expect(res.text).not.toContain(m.title)
      }
    }
    for (const id of ['abc', '0', '999999']) expect((await get(sup1, id)).status).toBe(404)
    expect((await request(app).get(path(m.id))).status).toBe(401)
    expect((await request(app).put(path(m.id)).send({ score: 1 })).status).toBe(401)
    expect((await request(app).post(`${path(m.id)}/release`)).status).toBe(401)
    expect(await storedScore(m.id)).toBe(77)
    expect(await changeCount(m.id)).toBe(1)
  })
})

describe('TEST-11-09 (AC-11-7): the database enforces the score rules', () => {
  const now = () => new Date()
  const reject = async (insert: () => Promise<unknown>) => {
    await expect(insert()).rejects.toThrow()
  }

  it('rejects bad MilestoneScore rows', async () => {
    const m = await milestone()
    await reject(() => prisma.milestoneScore.create({ data: { milestoneId: m.id, score: 101, createdAt: now(), updatedAt: now() } }))
    await reject(() => prisma.milestoneScore.create({ data: { milestoneId: m.id, score: -1, createdAt: now(), updatedAt: now() } }))
    await reject(() => prisma.milestoneScore.create({ data: { milestoneId: m.id, score: 50, releasedAt: now(), createdAt: now(), updatedAt: now() } }))
    await prisma.milestoneScore.create({ data: { milestoneId: m.id, score: 50, createdAt: now(), updatedAt: now() } })
    await reject(() => prisma.milestoneScore.create({ data: { milestoneId: m.id, score: 60, createdAt: now(), updatedAt: now() } }))
    expect(await prisma.milestoneScore.count({ where: { milestoneId: m.id } })).toBe(1)
  })

  it('rejects bad ScoreChange rows, including BR-12 (afterRelease needs a SET with a 3–500 character reason)', async () => {
    const m = await milestone()
    const row = await prisma.milestoneScore.create({ data: { milestoneId: m.id, score: 50, createdAt: now(), updatedAt: now() } })
    const base = { milestoneScoreId: row.id, changedById: sup1.id, changedAt: now() }
    await reject(() => prisma.scoreChange.create({ data: { ...base, kind: 'SET', newScore: null } }))
    await reject(() => prisma.scoreChange.create({ data: { ...base, kind: 'SET', newScore: 101 } }))
    await reject(() => prisma.scoreChange.create({ data: { ...base, kind: 'RELEASE', newScore: 50 } }))
    await reject(() => prisma.scoreChange.create({ data: { ...base, kind: 'RELEASE', reason: 'Why' } }))
    await reject(() => prisma.scoreChange.create({ data: { ...base, kind: 'SET', newScore: 60, afterRelease: true } }))
    await reject(() => prisma.scoreChange.create({ data: { ...base, kind: 'SET', newScore: 60, afterRelease: true, reason: 'ab' } }))
    await reject(() => prisma.scoreChange.create({ data: { ...base, kind: 'RELEASE', afterRelease: true } }))
    await reject(() => prisma.scoreChange.create({ data: { ...base, kind: 'SET', newScore: 60, reason: 'r'.repeat(501) } }))
    expect(await changeCount(m.id)).toBe(0)
    // The valid shapes are accepted.
    await prisma.scoreChange.create({ data: { ...base, kind: 'SET', oldScore: null, newScore: 50 } })
    await prisma.scoreChange.create({ data: { ...base, kind: 'RELEASE' } })
    await prisma.scoreChange.create({ data: { ...base, kind: 'SET', oldScore: 50, newScore: 60, afterRelease: true, reason: 'abc' } })
    expect(await changeCount(m.id)).toBe(3)
  })
})

describe('TEST-11-10 (AC-11-8): races', () => {
  it('(a) two PUTs at once, 20 times: both 200, two chained SET rows, stored value = the later row', async () => {
    for (let i = 0; i < 20; i++) {
      const m = await milestone()
      await put(sup1, m.id, { score: 50 })
      const [x, y] = await Promise.all([put(sup1, m.id, { score: 60 }), put(sup1, m.id, { score: 65 })])
      expect([x.status, y.status]).toEqual([200, 200])
      const sets = await prisma.scoreChange.findMany({ where: { milestoneScore: { milestoneId: m.id }, kind: 'SET' }, orderBy: { id: 'asc' } })
      expect(sets.map((s) => s.oldScore)).toEqual([null, 50, sets[1].newScore])
      expect(await storedScore(m.id)).toBe(sets[2].newScore)
    }
  })

  it('(b) a release and a reason-less change at once, 20 times: never a released value changed without a reason', async () => {
    for (let i = 0; i < 20; i++) {
      const m = await milestone()
      await put(sup1, m.id, { score: 50 })
      const [rel, change] = await Promise.all([release(sup1, m.id), put(sup1, m.id, { score: 55 })])
      expect(rel.status).toBe(200)
      const rows = await prisma.scoreChange.findMany({ where: { milestoneScore: { milestoneId: m.id } }, orderBy: { id: 'asc' } })
      if (change.status === 200) {
        // The change came first: SET 50 → 55, then RELEASE.
        expect(rows.map((r) => r.kind)).toEqual(['SET', 'SET', 'RELEASE'])
        expect(rows[1]).toMatchObject({ oldScore: 50, newScore: 55, afterRelease: false })
        expect(await storedScore(m.id)).toBe(55)
      } else {
        expect(change.status).toBe(400)
        expect(change.body.error.fields).toEqual({ reason: REASON_REQUIRED })
        expect(rows.map((r) => r.kind)).toEqual(['SET', 'RELEASE'])
        expect(await storedScore(m.id)).toBe(50)
      }
    }
  })
})

describe('TEST-11-11 (AC-11-9): any milestone state can be scored', () => {
  it('a milestone past its deadline with no submission, and one closed early: PUT 80 and release → 200', async () => {
    for (const m of [await milestone({ deadline: new Date(Date.now() - 3600000) }), await milestone({ closed: true })]) {
      expect((await put(sup1, m.id, { score: 80 })).status).toBe(200)
      expect((await release(sup1, m.id)).status).toBe(200)
    }
  })
})
