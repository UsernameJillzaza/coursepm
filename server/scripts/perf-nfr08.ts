import 'dotenv/config'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import request from 'supertest'
import app from '../src/app'
import { prisma } from '../src/db'
import { DEMO_USERS } from '../src/seed/demo'

// NFR-08 responsiveness smoke measurement (F-10 contract, TEST-10-07):
// warm, in-process, small data, on a developer laptop. Not a load test.
// `npm --prefix server run perf:nfr08` against the seeded development
// database (DATABASE_URL, after `npm run db:seed`). The fixture below is
// created in setup and removed in teardown, so other tests see the plain seed.
const WARMUP = 5
const SAMPLES = 50
const LIMIT_MS = 500

const password = process.env.SEED_PASSWORD
if (!password) throw new Error('SEED_PASSWORD is not set (see server/.env.example).')

const lines: string[] = []
const log = (line = '') => {
  lines.push(line)
  console.log(line)
}
const hours = (n: number) => new Date(Date.now() + n * 3_600_000)

// Nearest rank: the ceil(p * n)-th smallest sample (p95 of 50 = the 48th).
const nearestRank = (sorted: number[], p: number) => sorted[Math.ceil(p * sorted.length) - 1]

type Fixture = { milestoneIds: number[] }

// 10 milestones per demo team: 2 per board state, up to 3 revisions each,
// feedback on about half of the latest revisions (earlier revisions always
// have feedback, because CHG-01 requires it), and 2 extensions per team.
async function createFixture(runTag: string): Promise<Fixture> {
  const teams = await prisma.team.findMany({
    where: { courseCode: 'CPE334-DEMO' },
    include: { members: true, supervisors: true },
    orderBy: { name: 'asc' },
  })
  if (teams.length !== 3) throw new Error(`expected the 3 demo teams, found ${teams.length}; run npm run db:seed first`)
  const milestoneIds: number[] = []
  for (const team of teams) {
    const supervisorId = team.supervisors[0].userId
    const authors = team.members.map((m) => m.userId)
    // [deadline offset in hours, revisions, feedback on the latest, closed, extended]
    const plan: [number, number, boolean, boolean, boolean][] = [
      [48, 0, false, false, true], [72, 0, false, false, true], // NOT_SUBMITTED (both extended)
      [-24, 0, false, false, false], [-48, 0, false, false, false], // OVERDUE
      [24, 1, false, false, false], [-12, 3, false, false, false], // SUBMITTED
      [36, 2, true, false, false], [-36, 1, true, false, false], // FEEDBACK_GIVEN
      [96, 0, false, true, false], [60, 2, true, true, false], // CLOSED
    ]
    for (const [i, [offset, revisions, latestReviewed, closed, extended]] of plan.entries()) {
      const original = hours(offset - (extended ? 24 : 0))
      const m = await prisma.milestone.create({
        data: {
          teamId: team.id, title: `NFR-08 fixture ${runTag} ${i + 1}`, description: 'NFR-08 measurement fixture',
          deadline: original, maxRevisions: 3, createdById: supervisorId,
          ...(closed ? { closedAt: hours(-1), closedById: supervisorId } : {}),
        },
      })
      milestoneIds.push(m.id)
      for (let r = 1; r <= revisions; r++) {
        const s = await prisma.submission.create({
          data: {
            milestoneId: m.id, teamId: team.id, revision: r, title: `Fixture work v${r}`, description: 'x'.repeat(200),
            link: `https://example.com/nfr08/${m.id}/${r}`, submittedById: authors[r % authors.length], submittedAt: hours(-revisions + r - 2),
          },
        })
        // Earlier revisions always have feedback (CHG-01); the latest one per plan.
        if (r < revisions || latestReviewed) {
          await prisma.feedback.create({ data: { submissionId: s.id, supervisorId, body: 'Fixture feedback '.repeat(10) } })
        }
      }
      if (extended) {
        await prisma.deadlineExtension.create({
          data: { milestoneId: m.id, previousDeadline: original, newDeadline: hours(offset), reason: 'NFR-08 fixture', grantedById: supervisorId, grantedAt: new Date() },
        })
        await prisma.milestone.update({ where: { id: m.id }, data: { deadline: hours(offset) } })
      }
    }
  }
  return { milestoneIds }
}

async function removeFixture({ milestoneIds }: Fixture) {
  const where = { milestoneId: { in: milestoneIds } }
  await prisma.feedback.deleteMany({ where: { submission: where } })
  await prisma.submission.deleteMany({ where })
  await prisma.deadlineExtension.deleteMany({ where })
  await prisma.milestoneChange.deleteMany({ where })
  await prisma.milestone.deleteMany({ where: { id: { in: milestoneIds } } })
}

async function rowCounts() {
  return {
    teams: await prisma.team.count(),
    milestones: await prisma.milestone.count(),
    submissions: await prisma.submission.count(),
    feedback: await prisma.feedback.count(),
    extensions: await prisma.deadlineExtension.count(),
  }
}

async function login(key: string) {
  const user = DEMO_USERS.find((u) => u.email.startsWith(`${key}@`))!
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/login').send({ email: user.email, password })
  if (res.status !== 200) throw new Error(`login as ${key} failed: ${res.status}`)
  return { name: user.name, agent }
}

async function main() {
  const commit = execSync('git rev-parse --short HEAD').toString().trim()
  const dirty = execSync('git status --porcelain --untracked-files=no').toString().trim() !== ''
  const runTag = `${commit}-${Date.now()}`
  log(`# NFR-08 measurement (TEST-10-07) — commit ${commit}${dirty ? ' (working tree has uncommitted changes)' : ''} — ${new Date().toISOString()}`)
  log(`$ npm --prefix server run perf:nfr08`)
  log(`Method: one in-process Express app, one logged-in Supertest agent per user (logins before timing), ${WARMUP} warm-ups + ${SAMPLES} timed requests per endpoint per user; p95 = nearest rank (${Math.ceil(0.95 * SAMPLES)}th of ${SAMPLES}); pass when p95 < ${LIMIT_MS} ms.`)
  log(`Node ${process.version} on ${process.platform}; database: the seeded development database (DATABASE_URL).`)

  const fixture = await createFixture(runTag)
  let failed = false
  try {
    const counts = await rowCounts()
    log(`Dataset (whole database, demo seed + fixture): ${JSON.stringify(counts)}; fixture: ${fixture.milestoneIds.length} milestones (10 per team).`)

    const beta = await prisma.team.findFirstOrThrow({ where: { courseCode: 'CPE334-DEMO', name: 'Team Beta' } })
    const betaMilestones = await prisma.milestone.findMany({ where: { teamId: beta.id }, include: { _count: { select: { submissions: true } } }, orderBy: { id: 'asc' } })
    const target = betaMilestones.reduce((best, m) => (m._count.submissions > best._count.submissions ? m : best))
    log(`Records: Team Beta (id ${beta.id}, ${betaMilestones.length} milestones); its milestone with the most revisions: id ${target.id} (${target._count.submissions} revisions).`)

    const endpoints: [string, string][] = [
      ['/api/teams', '/api/teams'],
      ['/api/teams/:beta/milestones', `/api/teams/${beta.id}/milestones`],
      ['/api/milestones/:milestone/submissions', `/api/milestones/${target.id}/submissions`],
      ['/api/teams/:beta/board', `/api/teams/${beta.id}/board`],
      ['/api/milestones/:milestone/history', `/api/milestones/${target.id}/history`],
    ]
    log('History endpoint (F-08): included (F-08 is merged at this commit).')
    const users = [await login('supervisor2'), await login('beta1')]

    log()
    log('| User | Endpoint | p50 ms | p95 ms | max ms | Result |')
    log('| --- | --- | --- | --- | --- | --- |')
    for (const { name, agent } of users) {
      for (const [label, url] of endpoints) {
        for (let i = 0; i < WARMUP; i++) await agent.get(url).expect(200)
        const samples: number[] = []
        for (let i = 0; i < SAMPLES; i++) {
          const start = performance.now()
          const res = await agent.get(url)
          samples.push(performance.now() - start)
          if (res.status !== 200) throw new Error(`${url} as ${name}: ${res.status}`)
        }
        samples.sort((a, b) => a - b)
        const p95 = nearestRank(samples, 0.95)
        const pass = p95 < LIMIT_MS
        if (!pass) failed = true
        const ms = (v: number) => v.toFixed(1)
        log(`| ${name} | GET ${label} | ${ms(nearestRank(samples, 0.5))} | ${ms(p95)} | ${ms(samples[samples.length - 1])} | ${pass ? 'PASS' : 'FAIL'} |`)
      }
    }
  } finally {
    await removeFixture(fixture)
    log()
    log(`Teardown: fixture removed; dataset now ${JSON.stringify(await rowCounts())}.`)
  }
  log(`Overall: ${failed ? 'FAIL' : 'PASS'} (p95 < ${LIMIT_MS} ms for every endpoint and user: ${failed ? 'no' : 'yes'}).`)

  // Evidence file; a re-run of the same commit is kept next to the first one.
  const dir = path.join(__dirname, '..', '..', 'artifacts', 'sprint-2', 'perf')
  fs.mkdirSync(dir, { recursive: true })
  let file = path.join(dir, `nfr-08-${commit}.txt`)
  for (let n = 2; fs.existsSync(file); n++) file = path.join(dir, `nfr-08-${commit}-run${n}.txt`)
  fs.writeFileSync(file, lines.join('\n') + '\n')
  console.log(`Saved ${path.relative(path.join(__dirname, '..', '..'), file)}`)
  if (failed) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
