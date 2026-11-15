import type { FieldErrors } from '../http'

// F-05 business rules as pure functions, so they are unit-tested without a
// database (TEST-05-03, TEST-05-05, TEST-05-07). The route calls them with
// the server clock, never a time sent by the client (BR-06).

export type SubmitState = { deadline: Date; maxRevisions: number; revisionsUsed: number; now: Date }
export type SubmitCheck = { ok: true; nextRevision: number } | { ok: false; code: 'DEADLINE_PASSED' | 'REVISION_LIMIT_REACHED' }

// BR-06 deadline (inclusive, D-05), then BR-07 revision limit. Revisions are
// numbered 1, 2, 3 … with no gaps, so the next one is always used + 1.
export function checkCanSubmit({ deadline, maxRevisions, revisionsUsed, now }: SubmitState): SubmitCheck {
  if (now.getTime() > deadline.getTime()) return { ok: false, code: 'DEADLINE_PASSED' }
  if (revisionsUsed >= maxRevisions) return { ok: false, code: 'REVISION_LIMIT_REACHED' }
  return { ok: true, nextRevision: revisionsUsed + 1 }
}

export const TITLE_MIN = 3
export const TITLE_MAX = 120
export const DESCRIPTION_MAX = 2000
export const LINK_MAX = 2048

export type SubmissionInput = { title: string; description: string; link: string }

// BR-08: title 3–120, description ≤ 2,000, and an absolute http(s) URL of at
// most 2,048 characters. Parsing with URL() and checking the protocol rejects
// javascript:, ftp:, data: and scheme-less text.
export function validateSubmission(
  input: Record<string, unknown>,
): { ok: true; value: SubmissionInput } | { ok: false; fields: FieldErrors } {
  const fields: FieldErrors = {}

  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) fields.title = `Title must be ${TITLE_MIN}–${TITLE_MAX} characters.`

  const rawDescription = input.description === undefined ? '' : input.description
  if (typeof rawDescription !== 'string' || rawDescription.length > DESCRIPTION_MAX) {
    fields.description = `Description must be at most ${DESCRIPTION_MAX.toLocaleString('en')} characters.`
  }

  const link = typeof input.link === 'string' ? input.link.trim() : ''
  if (!isHttpUrl(link) || link.length > LINK_MAX) {
    fields.link = `Link must be a full http:// or https:// address of at most ${LINK_MAX.toLocaleString('en')} characters.`
  }

  if (Object.keys(fields).length) return { ok: false, fields }
  return { ok: true, value: { title, description: (rawDescription as string).trim(), link } }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
