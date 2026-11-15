import { checkCanSubmit, validateSubmission } from '../../src/rules/submission'

// F-05 business rules as pure functions: TEST-05-03 (BR-06 deadline),
// TEST-05-05 (BR-07 revision limit), TEST-05-07 unit part (BR-08 fields).
// Written and run BEFORE src/rules/submission.ts existed (TDD evidence).
const DEADLINE = new Date('2026-11-22T16:59:00.000Z')
const ms = (offset: number) => new Date(DEADLINE.getTime() + offset)

describe('TEST-05-03 checkCanSubmit: deadline rule (BR-06, D-05)', () => {
  const state = (now: Date) => ({ deadline: DEADLINE, maxRevisions: 3, revisionsUsed: 0, now })

  it('accepts 1 ms before the deadline', () => {
    expect(checkCanSubmit(state(ms(-1)))).toEqual({ ok: true, nextRevision: 1 })
  })

  it('accepts exactly at the deadline (the deadline is inclusive)', () => {
    expect(checkCanSubmit(state(ms(0)))).toEqual({ ok: true, nextRevision: 1 })
  })

  it('rejects 1 ms after the deadline with DEADLINE_PASSED', () => {
    expect(checkCanSubmit(state(ms(1)))).toEqual({ ok: false, code: 'DEADLINE_PASSED' })
  })
})

describe('TEST-05-05 checkCanSubmit: revision limit (BR-07)', () => {
  const state = (revisionsUsed: number) => ({ deadline: DEADLINE, maxRevisions: 2, revisionsUsed, now: ms(-60_000) })

  it('allows revision 1 and 2 when the limit is 2, numbering them with no gaps', () => {
    expect(checkCanSubmit(state(0))).toEqual({ ok: true, nextRevision: 1 })
    expect(checkCanSubmit(state(1))).toEqual({ ok: true, nextRevision: 2 })
  })

  it('rejects a third revision with REVISION_LIMIT_REACHED', () => {
    expect(checkCanSubmit(state(2))).toEqual({ ok: false, code: 'REVISION_LIMIT_REACHED' })
  })

  it('reports DEADLINE_PASSED first when both rules fail', () => {
    expect(checkCanSubmit({ deadline: DEADLINE, maxRevisions: 1, revisionsUsed: 1, now: ms(1) })).toEqual({
      ok: false,
      code: 'DEADLINE_PASSED',
    })
  })
})

describe('TEST-05-07 validateSubmission (BR-08)', () => {
  const valid = { title: 'Proposal v1', description: 'First draft', link: 'https://github.com/team/proj/pull/1' }

  it('accepts a valid submission and trims it', () => {
    expect(validateSubmission({ ...valid, title: '  Proposal v1 ' })).toEqual({ ok: true, value: valid })
  })

  it.each([
    ['ftp://files.example.com/a.pdf'],
    ['javascript:alert(1)'],
    ['not a url'],
    ['www.example.com/no-scheme'],
    [`https://example.com/${'x'.repeat(2030)}`],
    [''],
  ])('rejects the link %j', (link) => {
    const r = validateSubmission({ ...valid, link })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fields.link).toBeDefined()
  })

  it('accepts http and https links up to 2,048 characters', () => {
    expect(validateSubmission({ ...valid, link: 'http://example.com/report' }).ok).toBe(true)
    const long = `https://example.com/${'x'.repeat(2048 - 'https://example.com/'.length)}`
    expect(long).toHaveLength(2048)
    expect(validateSubmission({ ...valid, link: long }).ok).toBe(true)
  })

  it('rejects a 2-character title and an over-long description, reporting both', () => {
    const r = validateSubmission({ title: 'ab', description: 'x'.repeat(2001), link: valid.link })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.fields).sort()).toEqual(['description', 'title'])
  })
})
