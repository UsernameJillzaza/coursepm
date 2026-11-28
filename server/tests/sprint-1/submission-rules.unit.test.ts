import { checkCanSubmit, validateSubmission } from '../../src/rules/submission'

// F-05 business rules as pure functions: TEST-05-03 (BR-06 deadline),
// TEST-05-05 (BR-07 revision limit), TEST-05-07 unit part (BR-08 fields),
// TEST-05-11 (BR-07 since CHG-01: feedback before resubmission, #74).
// Written and run BEFORE src/rules/submission.ts existed (TDD evidence).
const DEADLINE = new Date('2026-11-22T16:59:00.000Z')
const ms = (offset: number) => new Date(DEADLINE.getTime() + offset)

describe('TEST-05-03 checkCanSubmit: deadline rule (BR-06, D-05)', () => {
  const state = (now: Date) => ({ deadline: DEADLINE, maxRevisions: 3, revisionsUsed: 0, latestHasFeedback: false, now })

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
  // CHG-01: latestHasFeedback is true here so these cases test the limit alone.
  const state = (revisionsUsed: number) => ({ deadline: DEADLINE, maxRevisions: 2, revisionsUsed, latestHasFeedback: true, now: ms(-60_000) })

  it('allows revision 1 and 2 when the limit is 2, numbering them with no gaps', () => {
    expect(checkCanSubmit(state(0))).toEqual({ ok: true, nextRevision: 1 })
    expect(checkCanSubmit(state(1))).toEqual({ ok: true, nextRevision: 2 })
  })

  it('rejects a third revision with REVISION_LIMIT_REACHED', () => {
    expect(checkCanSubmit(state(2))).toEqual({ ok: false, code: 'REVISION_LIMIT_REACHED' })
  })

  it('reports DEADLINE_PASSED first when both rules fail', () => {
    const both = { deadline: DEADLINE, maxRevisions: 1, revisionsUsed: 1, latestHasFeedback: true, now: ms(1) }
    expect(checkCanSubmit(both)).toEqual({
      ok: false,
      code: 'DEADLINE_PASSED',
    })
  })
})

describe('TEST-05-11 checkCanSubmit: feedback before resubmission (BR-07 since CHG-01, #74)', () => {
  const open = (revisionsUsed: number, latestHasFeedback: boolean, maxRevisions = 3) =>
    ({ deadline: DEADLINE, maxRevisions, revisionsUsed, latestHasFeedback, now: ms(-60_000) })

  it('revision 1 needs no feedback', () => {
    expect(checkCanSubmit(open(0, false))).toEqual({ ok: true, nextRevision: 1 })
  })

  it('revision 2 is rejected while revision 1 has no feedback, and names revision 1', () => {
    expect(checkCanSubmit(open(1, false))).toEqual({ ok: false, code: 'AWAITING_FEEDBACK', revision: 1 })
  })

  it('revision 2 is accepted once revision 1 has feedback (the boundary)', () => {
    expect(checkCanSubmit(open(1, true))).toEqual({ ok: true, nextRevision: 2 })
  })

  it('only the latest revision counts: revision 3 waits for feedback on revision 2', () => {
    expect(checkCanSubmit(open(2, false))).toEqual({ ok: false, code: 'AWAITING_FEEDBACK', revision: 2 })
  })

  it('check order: the deadline comes before the feedback rule', () => {
    const late = { ...open(1, false), now: ms(1) }
    expect(checkCanSubmit(late)).toEqual({ ok: false, code: 'DEADLINE_PASSED' })
  })

  it('check order: the limit comes before the feedback rule', () => {
    expect(checkCanSubmit(open(1, false, 1))).toEqual({ ok: false, code: 'REVISION_LIMIT_REACHED' })
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
