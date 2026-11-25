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
