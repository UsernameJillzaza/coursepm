// F-10 (FR-15) board states. Stub: the rule is not implemented yet. It returns
// fixed values so the RED tests fail on their assertions, not on an import.
export const BOARD_STATES = ['NOT_SUBMITTED', 'SUBMITTED', 'FEEDBACK_GIVEN', 'OVERDUE', 'CLOSED'] as const
export type BoardState = (typeof BOARD_STATES)[number]
export type LatestRevisionFact = { hasFeedback: boolean } | null

export function awaitsFeedback(_latest: LatestRevisionFact): boolean {
  return false
}

export function deriveMilestoneState(_input: { closedAt: Date | null; deadline: Date; latest: LatestRevisionFact; now: Date }): BoardState {
  return 'NOT_SUBMITTED'
}

export function parseBoardStateQuery(_query: unknown): { ok: true; state: BoardState | null } | { ok: false; fields: Record<string, string> } {
  return { ok: true, state: null }
}
