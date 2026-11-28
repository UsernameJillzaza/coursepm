import { awaitsFeedback, BOARD_STATES, deriveMilestoneState, parseBoardStateQuery } from '../../src/rules/board'

// F-10 board states as a pure rule (contract
// docs/sprints/sprint-2/F-10-progress-board.md): STS TEST-10-01, TEST-10-02,
// plus the state query parser and the shared CHG-01 condition
// ("Additional automated cases" in the STS).
const now = new Date('2026-12-10T11:00:00.000Z')
const past = new Date(now.getTime() - 86_400_000)
const future = new Date(now.getTime() + 86_400_000)
const closedAt = new Date(now.getTime() - 3_600_000)
const reviewed = { hasFeedback: true }
const waiting = { hasFeedback: false }

describe('TEST-10-01 (AC-10-1): deriveMilestoneState gives one state per condition, in precedence order', () => {
  it('returns each of the five states for its own condition', () => {
    expect(deriveMilestoneState({ closedAt, deadline: future, latest: null, now })).toBe('CLOSED')
    expect(deriveMilestoneState({ closedAt: null, deadline: future, latest: reviewed, now })).toBe('FEEDBACK_GIVEN')
    expect(deriveMilestoneState({ closedAt: null, deadline: future, latest: waiting, now })).toBe('SUBMITTED')
    expect(deriveMilestoneState({ closedAt: null, deadline: past, latest: null, now })).toBe('OVERDUE')
    expect(deriveMilestoneState({ closedAt: null, deadline: future, latest: null, now })).toBe('NOT_SUBMITTED')
  })

  it('closed + feedback → CLOSED; past deadline + latest without feedback → SUBMITTED', () => {
    expect(deriveMilestoneState({ closedAt, deadline: past, latest: reviewed, now })).toBe('CLOSED')
    expect(deriveMilestoneState({ closedAt: null, deadline: past, latest: waiting, now })).toBe('SUBMITTED')
    expect(deriveMilestoneState({ closedAt: null, deadline: past, latest: reviewed, now })).toBe('FEEDBACK_GIVEN')
  })
})

describe('TEST-10-02 (AC-10-2): boundaries', () => {
  it('no revision at now = deadline → NOT_SUBMITTED (inclusive, D-05); 1 ms later → OVERDUE', () => {
    expect(deriveMilestoneState({ closedAt: null, deadline: now, latest: null, now })).toBe('NOT_SUBMITTED')
    expect(deriveMilestoneState({ closedAt: null, deadline: now, latest: null, now: new Date(now.getTime() + 1) })).toBe('OVERDUE')
  })

  it('an overdue milestone whose deadline is moved to now + 1 day is NOT_SUBMITTED again (D-06)', () => {
    expect(deriveMilestoneState({ closedAt: null, deadline: past, latest: null, now })).toBe('OVERDUE')
    expect(deriveMilestoneState({ closedAt: null, deadline: future, latest: null, now })).toBe('NOT_SUBMITTED')
  })

  it('feedback on revision 1 only, revision 2 stored (latest = revision 2) → SUBMITTED', () => {
    // The caller passes the highest revision only; revision 2 has no feedback.
    expect(deriveMilestoneState({ closedAt: null, deadline: future, latest: { hasFeedback: false }, now })).toBe('SUBMITTED')
  })
})

describe('the board rule helpers (additional automated cases)', () => {
  it('awaitsFeedback is the CHG-01 condition: a latest revision without feedback', () => {
    expect(awaitsFeedback(null)).toBe(false)
    expect(awaitsFeedback(reviewed)).toBe(false)
    expect(awaitsFeedback(waiting)).toBe(true)
  })

  it('parseBoardStateQuery accepts no state or exactly one of the five names', () => {
    expect(parseBoardStateQuery(undefined)).toEqual({ ok: true, state: null })
    for (const state of BOARD_STATES) expect(parseBoardStateQuery(state)).toEqual({ ok: true, state })
  })

  it('parseBoardStateQuery rejects wrong case, unknown, empty and repeated values with fields.state', () => {
    const fields = { state: 'State must be one of NOT_SUBMITTED, SUBMITTED, FEEDBACK_GIVEN, OVERDUE, CLOSED.' }
    for (const bad of ['overdue', 'DONE', '', ['OVERDUE', 'CLOSED'], { a: 'b' }]) {
      expect(parseBoardStateQuery(bad)).toEqual({ ok: false, fields })
    }
  })
})
