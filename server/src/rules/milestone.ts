import { hasMultiLineControl, hasSingleLineControl } from './text'

export type ValidMilestone = {
  title: string
  description: string
  deadline: Date
  maxRevisions: number
}

export type MilestoneValidation =
  | { ok: true; value: ValidMilestone }
  | { ok: false; fields: Record<string, string> }

// Validation is pure so the route can run it after scope and role checks.
// The client sends ISO 8601 UTC; requiring a timezone avoids interpreting a
// timestamp in the server's local timezone.
export function validateMilestone(input: unknown, now: Date): MilestoneValidation {
  const body = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
  const fields: Record<string, string> = {}

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (title.length < 3 || title.length > 120) fields.title = 'Title must be 3–120 characters.'
  else if (hasSingleLineControl(title)) fields.title = 'Title must not contain control characters.'

  const description = body.description === undefined ? '' : body.description
  if (typeof description !== 'string' || description.length > 2000) {
    fields.description = 'Description must be at most 2,000 characters.'
  } else if (hasMultiLineControl(description)) {
    fields.description = 'Description must not contain control characters.'
  }

  const deadlineText = body.deadline
  const hasTimezone = typeof deadlineText === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(deadlineText)
  const deadline = hasTimezone ? new Date(deadlineText) : new Date(NaN)
  if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= now.getTime()) {
    fields.deadline = 'Deadline must be a valid future date.'
  }

  const maxRevisions = body.maxRevisions === undefined ? 3 : body.maxRevisions
  if (typeof maxRevisions !== 'number' || !Number.isInteger(maxRevisions) || maxRevisions < 1 || maxRevisions > 5) {
    fields.maxRevisions = 'Revision limit must be an integer from 1 to 5.'
  }

  if (Object.keys(fields).length) return { ok: false, fields }
  return { ok: true, value: { title, description: description as string, deadline, maxRevisions: maxRevisions as number } }
}

// ── F-08 milestone maintenance (FR-12, FR-13, BR-11, D-06, D-09) ──────────────

const ISO_WITH_TIMEZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

// An ISO 8601 date with a timezone that is after `now`, or null.
function parseFutureDate(value: unknown, now: Date): Date | null {
  if (typeof value !== 'string' || !ISO_WITH_TIMEZONE.test(value)) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.getTime() > now.getTime() ? date : null
}

function asBody(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
}

export type MilestoneEditChanges = { description?: string; deadline?: Date }
export type MilestoneEditValidation =
  | { ok: true; changes: MilestoneEditChanges }
  | { ok: false; fields: Record<string, string> }
  | { ok: false; noChange: true }

// FR-12 edit. Reuses the BR-05 field rules of creation. Title and the revision
// limit are fixed after creation; other unknown keys are ignored. A field sent
// with its stored value (a deadline: the same instant) is skipped. The route
// runs this before the row lock for the shape (400) and again with the locked
// row for NO_CHANGE, so the relative check always sees the locked values.
export function validateMilestoneEdit(
  input: unknown,
  now: Date,
  stored: { description: string; deadline: Date },
): MilestoneEditValidation {
  const body = asBody(input)
  const fields: Record<string, string> = {}
  if (body.title !== undefined) fields.title = 'Title cannot be changed after creation.'
  if (body.maxRevisions !== undefined) fields.maxRevisions = 'The revision limit cannot be changed after creation.'

  const changes: MilestoneEditChanges = {}
  if (body.description !== undefined) {
    const description = body.description
    if (typeof description !== 'string' || description.length > 2000) {
      fields.description = 'Description must be at most 2,000 characters.'
    } else if (hasMultiLineControl(description)) {
      fields.description = 'Description must not contain control characters.'
    } else if (description !== stored.description) {
      changes.description = description
    }
  }
  if (body.deadline !== undefined) {
    const deadline = parseFutureDate(body.deadline, now)
    if (!deadline) fields.deadline = 'Deadline must be a valid future date.'
    else if (deadline.getTime() !== stored.deadline.getTime()) changes.deadline = deadline
  }

  if (Object.keys(fields).length) return { ok: false, fields }
  if (Object.keys(changes).length === 0) return { ok: false, noChange: true }
  return { ok: true, changes }
}

export const REASON_MIN = 3
export const REASON_MAX = 500

// FR-13 extension request shape. Comparing newDeadline with the current
// deadline (BR-11) happens in the route, after the row lock.
export function validateExtension(
  input: unknown,
  now: Date,
): { ok: true; value: { newDeadline: Date; reason: string } } | { ok: false; fields: Record<string, string> } {
  const body = asBody(input)
  const fields: Record<string, string> = {}
  const newDeadline = parseFutureDate(body.newDeadline, now)
  if (!newDeadline) fields.newDeadline = 'New deadline must be a valid future date.'
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) fields.reason = `Reason must be ${REASON_MIN}–${REASON_MAX} characters.`
  else if (hasMultiLineControl(reason)) fields.reason = 'Reason must not contain control characters.'
  if (Object.keys(fields).length || !newDeadline) return { ok: false, fields }
  return { ok: true, value: { newDeadline, reason } }
}

// FR-12 close early: the reason is optional (blank → null), at most 500
// characters, no control characters other than tab / line feed / carriage return.
export function validateCloseReason(input: unknown): { ok: true; reason: string | null } | { ok: false; fields: Record<string, string> } {
  const raw = asBody(input).reason
  if (raw === undefined || raw === null) return { ok: true, reason: null }
  const reason = typeof raw === 'string' ? raw.trim() : null
  if (reason === null || reason.length > REASON_MAX) return { ok: false, fields: { reason: `Reason must be at most ${REASON_MAX} characters.` } }
  if (hasMultiLineControl(reason)) return { ok: false, fields: { reason: 'Reason must not contain control characters.' } }
  return { ok: true, reason: reason.length ? reason : null }
}

type Person = { id: number; name: string }
export type ChangeRow = {
  id: number
  kind: 'EDIT' | 'CLOSE'
  field: string | null
  oldValue: string | null
  newValue: string | null
  reason: string | null
  changedBy: Person
  changedAt: Date
}
export type ExtensionRow = { id: number; previousDeadline: Date; newDeadline: Date; reason: string; grantedBy: Person; grantedAt: Date }
export type HistoryItem = {
  kind: 'EDIT' | 'CLOSE' | 'EXTENSION'
  field: string | null
  oldValue: string | null
  newValue: string | null
  reason: string | null
  by: Person
  at: Date
}

const KIND_RANK = { CLOSE: 0, EXTENSION: 1, EDIT: 2 } as const

// One history list from both audit tables: newest first, then CLOSE before
// EXTENSION before EDIT at the same instant, then id descending within a kind.
export function mergeHistory(changes: ChangeRow[], extensions: ExtensionRow[]): HistoryItem[] {
  const entries: { id: number; item: HistoryItem }[] = [
    ...changes.map((c) => ({
      id: c.id,
      item: { kind: c.kind, field: c.field, oldValue: c.oldValue, newValue: c.newValue, reason: c.reason, by: c.changedBy, at: c.changedAt },
    })),
    ...extensions.map((e) => ({
      id: e.id,
      item: {
        kind: 'EXTENSION' as const,
        field: 'deadline',
        oldValue: e.previousDeadline.toISOString(),
        newValue: e.newDeadline.toISOString(),
        reason: e.reason,
        by: e.grantedBy,
        at: e.grantedAt,
      },
    })),
  ]
  entries.sort((a, b) =>
    b.item.at.getTime() - a.item.at.getTime()
    || KIND_RANK[a.item.kind] - KIND_RANK[b.item.kind]
    || b.id - a.id)
  return entries.map((e) => e.item)
}
