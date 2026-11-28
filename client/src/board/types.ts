// F-10 board (GET /api/teams/:teamId/board). The server derives `state`; the
// client never re-derives it from deadlines or revisions.
export const BOARD_COLUMNS = ['NOT_SUBMITTED', 'SUBMITTED', 'FEEDBACK_GIVEN', 'OVERDUE', 'CLOSED'] as const
export type BoardState = (typeof BOARD_COLUMNS)[number]

export const BOARD_LABELS: Record<BoardState, string> = {
  NOT_SUBMITTED: 'Not submitted',
  SUBMITTED: 'Submitted',
  FEEDBACK_GIVEN: 'Feedback given',
  OVERDUE: 'Overdue',
  CLOSED: 'Closed',
}

export type BoardItem = {
  milestoneId: number
  title: string
  deadline: string
  originalDeadline: string
  extended: boolean
  closedAt: string | null
  state: BoardState
  revisionsUsed: number
  maxRevisions: number
  latest: null | { revision: number; submittedAt: string; submittedBy: { id: number; name: string }; hasFeedback: boolean }
}

export type Board = {
  team: { id: number; name: string }
  generatedAt: string
  counts: Record<BoardState, number>
  items: BoardItem[]
}

export function isBoardState(value: string | null): value is BoardState {
  return value !== null && (BOARD_COLUMNS as readonly string[]).includes(value)
}
