export type Milestone = {
  id: number
  teamId: number
  title: string
  description: string
  deadline: string
  maxRevisions: number
  createdById: number
  createdAt: string
  revisionsUsed: number
  status: 'OPEN' | 'CLOSED'
  latestSubmittedAt: string | null
  // F-08. Optional so the Sprint 1 test fixtures still type-check.
  closedAt?: string | null
  originalDeadline?: string
  extended?: boolean
}

// F-08 history entry (GET /api/milestones/:id/history).
export type HistoryItem = {
  kind: 'EDIT' | 'EXTENSION' | 'CLOSE'
  field: 'description' | 'deadline' | null
  oldValue: string | null
  newValue: string | null
  reason: string | null
  by: { id: number; name: string }
  at: string
}

export function bangkokTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value)).replace(',', '')
}

// Short form used by the F-08 header and history: "12 Dec 18:00".
export function bangkokShort(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value)).replace(',', '')
}

// <input type="datetime-local"> holds Bangkok wall time (UTC+7, no DST, D-05).
export function bangkokInputToUtc(local: string) {
  const value = new Date(`${local}:00+07:00`)
  return Number.isFinite(value.getTime()) ? value.toISOString() : local
}

export function utcToBangkokInput(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 16)
}

// FR-12: an edit is allowed only before anything has happened against the
// deadline. The server enforces the same rule; this only hides the button.
export function inEditWindow(m: Milestone) {
  return m.status === 'OPEN' && !m.closedAt && !m.extended && m.revisionsUsed === 0
}
