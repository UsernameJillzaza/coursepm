// F-10 (FR-15) board states, derived from stored facts and never stored.
// BOARD_STATES is also the display order of the board columns (FR-15).
export const BOARD_STATES = ['NOT_SUBMITTED', 'SUBMITTED', 'FEEDBACK_GIVEN', 'OVERDUE', 'CLOSED'] as const
export type BoardState = (typeof BOARD_STATES)[number]

// The latest stored revision (highest `revision`, BR-07), or null when none.
export type LatestRevisionFact = { hasFeedback: boolean } | null

// CHG-01 (F-05 v1.2): the newest work is waiting for feedback, so the team may
// not submit the next revision yet. The milestone DTO's awaitingFeedback and
// the board's SUBMITTED state both use this one condition.
export function awaitsFeedback(latest: LatestRevisionFact): boolean {
  return latest !== null && !latest.hasFeedback
}

// Precedence (F-10 contract): CLOSED → FEEDBACK_GIVEN → SUBMITTED → OVERDUE →
// NOT_SUBMITTED. The deadline only matters when no work exists; it is
// inclusive (D-05) and already moved by any extension (D-06).
export function deriveMilestoneState(input: { closedAt: Date | null; deadline: Date; latest: LatestRevisionFact; now: Date }): BoardState {
  const { closedAt, deadline, latest, now } = input
  if (closedAt) return 'CLOSED'
  if (latest) return awaitsFeedback(latest) ? 'SUBMITTED' : 'FEEDBACK_GIVEN'
  return now.getTime() > deadline.getTime() ? 'OVERDUE' : 'NOT_SUBMITTED'
}

const STATE_MESSAGE = `State must be one of ${BOARD_STATES.join(', ')}.`

// ?state= is optional; when present it must be exactly one of the five names
// (case-sensitive). An empty value or a repeated parameter is a 400.
export function parseBoardStateQuery(query: unknown): { ok: true; state: BoardState | null } | { ok: false; fields: Record<string, string> } {
  if (query === undefined) return { ok: true, state: null }
  if (typeof query === 'string' && (BOARD_STATES as readonly string[]).includes(query)) {
    return { ok: true, state: query as BoardState }
  }
  return { ok: false, fields: { state: STATE_MESSAGE } }
}
