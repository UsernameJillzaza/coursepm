import { checkScoreChange, scoreViewFor, validateScoreInput } from '../../src/rules/score'

// F-11 Milestone scoring and release: pure rule functions in rules/score.ts.
// Sprint 3 STS TEST-11-01 (AC-11-5), TEST-11-02 (AC-11-4, AC-11-5),
// TEST-11-03 (AC-11-2, AC-11-3).

const NUL = String.fromCharCode(0)
const SCORE_MESSAGE = 'Score must be a whole number from 0 to 100.'
const REASON_MESSAGE = 'Reason must be at most 500 characters.'
const REASON_REQUIRED = 'A reason (3–500 characters) is required to change a released score.'

describe('TEST-11-01 (AC-11-5): validateScoreInput', () => {
  it.each([[0], [100], [85]])('accepts the whole number %j', (score) => {
    expect(validateScoreInput({ score })).toEqual({ ok: true, value: { score, reason: null } })
  })

  it.each([
    ['-1', -1],
    ['101', 101],
    ['85.5', 85.5],
    ['the string "85"', '85'],
    ['null', null],
    ['missing', undefined],
    ['NaN', Number.NaN],
    ['true', true],
  ])('rejects a score that is %s', (_label, score) => {
    expect(validateScoreInput({ score })).toEqual({ ok: false, fields: { score: SCORE_MESSAGE } })
  })

  it('a body that is not an object has no score', () => {
    expect(validateScoreInput(null)).toEqual({ ok: false, fields: { score: SCORE_MESSAGE } })
    expect(validateScoreInput([85])).toEqual({ ok: false, fields: { score: SCORE_MESSAGE } })
  })

  it('trims the reason; 500 characters are accepted, 501 are not', () => {
    expect(validateScoreInput({ score: 70, reason: '  Regraded after appeal  ' })).toEqual({ ok: true, value: { score: 70, reason: 'Regraded after appeal' } })
    expect(validateScoreInput({ score: 70, reason: 'r'.repeat(500) })).toEqual({ ok: true, value: { score: 70, reason: 'r'.repeat(500) } })
    expect(validateScoreInput({ score: 70, reason: 'r'.repeat(501) })).toEqual({ ok: false, fields: { reason: REASON_MESSAGE } })
  })

  it('a reason with a NUL or another control character is rejected; tab and line breaks are allowed', () => {
    expect(validateScoreInput({ score: 70, reason: `Regraded${NUL}` })).toEqual({ ok: false, fields: { reason: REASON_MESSAGE } })
    expect(validateScoreInput({ score: 70, reason: 'line one\nline\ttwo' })).toEqual({ ok: true, value: { score: 70, reason: 'line one\nline\ttwo' } })
  })

  it('an empty or all-space reason counts as no reason, and a non-string reason is rejected', () => {
    expect(validateScoreInput({ score: 70, reason: '   ' })).toEqual({ ok: true, value: { score: 70, reason: null } })
    expect(validateScoreInput({ score: 70, reason: '' })).toEqual({ ok: true, value: { score: 70, reason: null } })
    expect(validateScoreInput({ score: 70, reason: null })).toEqual({ ok: true, value: { score: 70, reason: null } })
    expect(validateScoreInput({ score: 70, reason: 5 })).toEqual({ ok: false, fields: { reason: REASON_MESSAGE } })
  })

  it('reports both fields at once', () => {
    expect(validateScoreInput({ score: 101, reason: 'r'.repeat(501) })).toEqual({ ok: false, fields: { score: SCORE_MESSAGE, reason: REASON_MESSAGE } })
  })
})

describe('TEST-11-02 (AC-11-4, AC-11-5): checkScoreChange', () => {
  const unreleased = { score: 85, releasedAt: null }
  const released = { score: 90, releasedAt: new Date('2026-11-29T03:00:00Z') }

  it('the first score needs no reason', () => {
    expect(checkScoreChange(null, { score: 85, reason: null })).toEqual({ ok: true })
  })

  it('before release a change needs no reason', () => {
    expect(checkScoreChange(unreleased, { score: 90, reason: null })).toEqual({ ok: true })
  })

  it('the stored value again is NO_CHANGE, with or without a reason, released or not', () => {
    expect(checkScoreChange(unreleased, { score: 85, reason: null })).toEqual({ ok: false, noChange: true })
    expect(checkScoreChange(released, { score: 90, reason: 'Same again' })).toEqual({ ok: false, noChange: true })
  })

  it('after release: no reason or a 2-character reason → fields.reason; 3 and 500 characters → ok', () => {
    expect(checkScoreChange(released, { score: 70, reason: null })).toEqual({ ok: false, fields: { reason: REASON_REQUIRED } })
    expect(checkScoreChange(released, { score: 70, reason: 'ab' })).toEqual({ ok: false, fields: { reason: REASON_REQUIRED } })
    expect(checkScoreChange(released, { score: 70, reason: 'abc' })).toEqual({ ok: true })
    expect(checkScoreChange(released, { score: 70, reason: 'r'.repeat(500) })).toEqual({ ok: true })
  })
})

describe('TEST-11-03 (AC-11-2, AC-11-3): scoreViewFor', () => {
  const sup = { id: 1, name: 'Dr. Supervisor One' }
  const at = (h: number) => new Date(Date.UTC(2026, 10, 29, h))
  const unreleasedRow = {
    score: 85, releasedAt: null, releasedBy: null,
    changes: [{ id: 1, kind: 'SET' as const, oldScore: null, newScore: 85, reason: null, changedBy: sup, changedAt: at(1) }],
  }
  const releasedRow = {
    score: 70, releasedAt: at(3), releasedBy: sup,
    changes: [
      { id: 1, kind: 'SET' as const, oldScore: null, newScore: 90, reason: null, changedBy: sup, changedAt: at(1) },
      { id: 2, kind: 'RELEASE' as const, oldScore: null, newScore: null, reason: null, changedBy: sup, changedAt: at(3) },
      { id: 3, kind: 'SET' as const, oldScore: 90, newScore: 70, reason: 'Regraded after appeal', changedBy: sup, changedAt: at(4) },
    ],
  }

  it('the supervisor sees null without a score, and the full view otherwise, history newest first', () => {
    expect(scoreViewFor('SUPERVISOR', null)).toBeNull()
    expect(scoreViewFor('SUPERVISOR', unreleasedRow)).toEqual({
      value: 85, releasedAt: null, releasedBy: null,
      history: [{ kind: 'SET', oldValue: null, newValue: 85, reason: null, by: sup, at: at(1) }],
    })
    expect(scoreViewFor('SUPERVISOR', releasedRow)).toEqual({
      value: 70, releasedAt: at(3), releasedBy: sup,
      history: [
        { kind: 'SET', oldValue: 90, newValue: 70, reason: 'Regraded after appeal', by: sup, at: at(4) },
        { kind: 'RELEASE', oldValue: null, newValue: null, reason: null, by: sup, at: at(3) },
        { kind: 'SET', oldValue: null, newValue: 90, reason: null, by: sup, at: at(1) },
      ],
    })
  })

  it('history ties at the same instant are ordered by id, newest first', () => {
    const tie = { ...unreleasedRow, changes: [
      { id: 7, kind: 'SET' as const, oldScore: null, newScore: 50, reason: null, changedBy: sup, changedAt: at(1) },
      { id: 8, kind: 'SET' as const, oldScore: 50, newScore: 85, reason: null, changedBy: sup, changedAt: at(1) },
    ] }
    expect(scoreViewFor('SUPERVISOR', tie)!.history.map((h) => h.newValue)).toEqual([85, 50])
  })

  it('a student sees null without a score and before release, and only value + releasedAt after', () => {
    expect(scoreViewFor('STUDENT', null)).toBeNull()
    expect(scoreViewFor('STUDENT', unreleasedRow)).toBeNull()
    expect(scoreViewFor('STUDENT', releasedRow)).toEqual({ value: 70, releasedAt: at(3) })
  })
})
