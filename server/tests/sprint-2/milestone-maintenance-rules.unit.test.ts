import { mergeHistory, validateCloseReason, validateExtension, validateMilestoneEdit } from '../../src/rules/milestone'
import { checkCanSubmit } from '../../src/rules/submission'

// F-08 pure rules (contract docs/sprints/sprint-2/F-08-milestone-maintenance.md):
// STS TEST-08-03, TEST-08-07, TEST-08-14, TEST-08-18.
const now = new Date('2026-12-01T05:00:00.000Z')
const stored = { description: 'Original text', deadline: new Date('2026-12-05T11:00:00.000Z') }
const iso = (ms: number) => new Date(ms).toISOString()

describe('TEST-08-03 (AC-08-3): validateMilestoneEdit', () => {
  it('rejects a past deadline and a deadline without a timezone', () => {
    const past = validateMilestoneEdit({ deadline: '2026-11-30T00:00:00Z' }, now, stored)
    expect(past).toEqual({ ok: false, fields: { deadline: expect.any(String) } })
    const noTz = validateMilestoneEdit({ deadline: '2026-12-09T10:00:00' }, now, stored)
    expect(noTz).toEqual({ ok: false, fields: { deadline: expect.any(String) } })
  })

  it('accepts a description of 2,000 characters or an empty one, rejects 2,001 and a NUL', () => {
    expect(validateMilestoneEdit({ description: 'x'.repeat(2000) }, now, stored)).toEqual({ ok: true, changes: { description: 'x'.repeat(2000) } })
    expect(validateMilestoneEdit({ description: '' }, now, stored)).toEqual({ ok: true, changes: { description: '' } })
    expect(validateMilestoneEdit({ description: 'x'.repeat(2001) }, now, stored)).toEqual({ ok: false, fields: { description: expect.any(String) } })
    expect(validateMilestoneEdit({ description: 'a\u0000b' }, now, stored)).toEqual({ ok: false, fields: { description: expect.any(String) } })
  })

  it('names title and maxRevisions as fields that cannot be changed', () => {
    const res = validateMilestoneEdit({ title: 'New title', maxRevisions: 5, description: 'Changed' }, now, stored)
    expect(res).toEqual({ ok: false, fields: { title: 'Title cannot be changed after creation.', maxRevisions: 'The revision limit cannot be changed after creation.' } })
  })

  it('gives noChange for equal values, the same instant in another offset, an empty body and unknown-only keys', () => {
    expect(validateMilestoneEdit({ description: 'Original text', deadline: '2026-12-05T11:00:00Z' }, now, stored)).toEqual({ ok: false, noChange: true })
    expect(validateMilestoneEdit({ deadline: '2026-12-05T18:00:00+07:00' }, now, stored)).toEqual({ ok: false, noChange: true })
    expect(validateMilestoneEdit({}, now, stored)).toEqual({ ok: false, noChange: true })
    expect(validateMilestoneEdit({ colour: 'red' }, now, stored)).toEqual({ ok: false, noChange: true })
  })

  it('skips a field that was sent unchanged and keeps the one that changed', () => {
    const res = validateMilestoneEdit({ description: 'Original text', deadline: '2026-12-06T11:00:00Z' }, now, stored)
    expect(res).toEqual({ ok: true, changes: { deadline: new Date('2026-12-06T11:00:00Z') } })
  })
})

describe('TEST-08-07 (AC-08-6): validateExtension', () => {
  const good = 'Server outage'
  it('rejects a past, malformed or timezone-less new deadline and accepts now + 1 ms', () => {
    for (const newDeadline of ['2026-11-30T00:00:00Z', 'tomorrow', '2026-12-09T10:00:00', 42]) {
      expect(validateExtension({ newDeadline, reason: good }, now)).toEqual({ ok: false, fields: { newDeadline: expect.any(String) } })
    }
    expect(validateExtension({ newDeadline: iso(now.getTime() + 1), reason: good }, now)).toEqual({
      ok: true,
      value: { newDeadline: new Date(now.getTime() + 1), reason: good },
    })
  })

  it('needs a trimmed reason of 3-500 characters without control characters', () => {
    const nd = '2026-12-09T10:00:00Z'
    for (const reason of [undefined, 'ab', '  ab  ', 'x'.repeat(501), 'a\u0000bc']) {
      expect(validateExtension({ newDeadline: nd, reason }, now)).toEqual({ ok: false, fields: { reason: expect.any(String) } })
    }
    expect(validateExtension({ newDeadline: nd, reason: '  abc  ' }, now)).toMatchObject({ ok: true, value: { reason: 'abc' } })
    expect(validateExtension({ newDeadline: nd, reason: 'x'.repeat(500) }, now)).toMatchObject({ ok: true })
  })
})

describe('validateCloseReason (AC-08-8)', () => {
  it('allows no reason, keeps a trimmed one, rejects 501 characters and a NUL', () => {
    expect(validateCloseReason({})).toEqual({ ok: true, reason: null })
    expect(validateCloseReason({ reason: '   ' })).toEqual({ ok: true, reason: null })
    expect(validateCloseReason({ reason: ' Done early ' })).toEqual({ ok: true, reason: 'Done early' })
    expect(validateCloseReason({ reason: 'x'.repeat(501) })).toEqual({ ok: false, fields: { reason: expect.any(String) } })
    expect(validateCloseReason({ reason: 'a\u0000b' })).toEqual({ ok: false, fields: { reason: expect.any(String) } })
  })
})

describe('TEST-08-14 (AC-08-8): checkCanSubmit checks closed first', () => {
  // latestHasFeedback is required since CHG-01 (#74); true here so only the closed rule is tested.
  const base = { deadline: new Date(now.getTime() + 60_000), maxRevisions: 3, revisionsUsed: 0, latestHasFeedback: true, now }
  it('returns MILESTONE_CLOSED with a future deadline', () => {
    expect(checkCanSubmit({ ...base, closedAt: now })).toEqual({ ok: false, code: 'MILESTONE_CLOSED' })
  })
  it('returns MILESTONE_CLOSED even when the deadline passed and the limit is reached', () => {
    const late = { ...base, deadline: new Date(now.getTime() - 60_000), maxRevisions: 1, revisionsUsed: 1 }
    expect(checkCanSubmit({ ...late, closedAt: now })).toEqual({ ok: false, code: 'MILESTONE_CLOSED' })
  })
  it('keeps the Sprint 1 results when closedAt is absent or null', () => {
    expect(checkCanSubmit(base)).toEqual({ ok: true, nextRevision: 1 })
    expect(checkCanSubmit({ ...base, closedAt: null })).toEqual({ ok: true, nextRevision: 1 })
  })
})

describe('TEST-08-19 (AC-08-8, AC-05-11): combined order closed -> deadline -> limit -> feedback (F-08 + CHG-01)', () => {
  const waiting = { deadline: new Date(now.getTime() + 60_000), maxRevisions: 3, revisionsUsed: 1, latestHasFeedback: false, now }
  it('a closed milestone whose latest revision has no feedback answers MILESTONE_CLOSED, not AWAITING_FEEDBACK', () => {
    expect(checkCanSubmit({ ...waiting, closedAt: now })).toEqual({ ok: false, code: 'MILESTONE_CLOSED' })
  })
  it('an open milestone with the same state still waits for feedback', () => {
    expect(checkCanSubmit({ ...waiting, closedAt: null })).toEqual({ ok: false, code: 'AWAITING_FEEDBACK', revision: 1 })
  })
})

describe('TEST-08-18 (AC-08-10): mergeHistory order', () => {
  it('orders by time desc, then CLOSE, EXTENSION, EDIT, then id desc within a kind', () => {
    const t = new Date('2026-12-01T05:00:00Z')
    const old = new Date('2026-11-30T05:00:00Z')
    const by = { id: 1, name: 'S' }
    const items = mergeHistory(
      [
        { id: 10, kind: 'EDIT', field: 'description', oldValue: 'a', newValue: 'b', reason: null, changedBy: by, changedAt: t },
        { id: 11, kind: 'EDIT', field: 'deadline', oldValue: 'c', newValue: 'd', reason: null, changedBy: by, changedAt: t },
        { id: 12, kind: 'CLOSE', field: null, oldValue: null, newValue: null, reason: null, changedBy: by, changedAt: t },
        { id: 3, kind: 'EDIT', field: 'description', oldValue: 'x', newValue: 'y', reason: null, changedBy: by, changedAt: old },
      ],
      [{ id: 5, previousDeadline: new Date('2026-12-02T00:00:00Z'), newDeadline: new Date('2026-12-03T00:00:00Z'), reason: 'r r', grantedBy: by, grantedAt: t }],
    )
    expect(items.map((i) => `${i.kind}:${i.at.toISOString() === t.toISOString() ? 'new' : 'old'}:${i.field ?? '-'}`)).toEqual([
      'CLOSE:new:-',
      'EXTENSION:new:deadline',
      'EDIT:new:deadline',
      'EDIT:new:description',
      'EDIT:old:description',
    ])
    expect(items[1]).toEqual({
      kind: 'EXTENSION', field: 'deadline', oldValue: '2026-12-02T00:00:00.000Z', newValue: '2026-12-03T00:00:00.000Z', reason: 'r r', by, at: t,
    })
  })
})
