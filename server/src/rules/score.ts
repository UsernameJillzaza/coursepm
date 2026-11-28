import type { FieldErrors } from '../http'
import type { Role } from '../generated/prisma/client'
import { hasMultiLineControl } from './text'

// F-11 Milestone scoring and release (FR-16, BR-12, D-10). Pure functions,
// unit-tested in TEST-11-01 … TEST-11-03. The route applies them after the
// milestone row lock, so they always see the committed state.

export const SCORE_MESSAGE = 'Score must be a whole number from 0 to 100.'
export const REASON_MESSAGE = 'Reason must be at most 500 characters.'
export const REASON_REQUIRED = 'A reason (3–500 characters) is required to change a released score.'
const REASON_MIN = 3
const REASON_MAX = 500

export type ScoreInput = { score: number; reason: string | null }

// score: a JSON integer 0–100 ("85", 85.5, null, missing are rejected).
// reason: optional; trimmed; empty or all spaces = no reason; at most 500
// characters; no control characters other than tab / line feed / CR.
export function validateScoreInput(body: unknown): { ok: true; value: ScoreInput } | { ok: false; fields: FieldErrors } {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  const fields: FieldErrors = {}

  const score = input.score
  const validScore = typeof score === 'number' && Number.isInteger(score) && score >= 0 && score <= 100
  if (!validScore) fields.score = SCORE_MESSAGE

  let reason: string | null = null
  const raw = input.reason
  if (raw !== undefined && raw !== null) {
    if (typeof raw !== 'string') fields.reason = REASON_MESSAGE
    else {
      const trimmed = raw.trim()
      if (trimmed.length > REASON_MAX || hasMultiLineControl(trimmed)) fields.reason = REASON_MESSAGE
      else reason = trimmed.length ? trimmed : null
    }
  }

  if (Object.keys(fields).length) return { ok: false, fields }
  return { ok: true, value: { score: score as number, reason } }
}

// Relative check against the locked, stored score. The same value is
// NO_CHANGE whatever the reason; a released score changes only with a reason
// of 3–500 characters (BR-12).
export function checkScoreChange(
  stored: { score: number; releasedAt: Date | null } | null,
  value: ScoreInput,
): { ok: true } | { ok: false; noChange: true } | { ok: false; fields: FieldErrors } {
  if (stored && stored.score === value.score) return { ok: false, noChange: true }
  if (stored?.releasedAt && (!value.reason || value.reason.length < REASON_MIN)) {
    return { ok: false, fields: { reason: REASON_REQUIRED } }
  }
  return { ok: true }
}

type Person = { id: number; name: string }
export type ScoreRow = {
  score: number
  releasedAt: Date | null
  releasedBy: Person | null
  changes: {
    id: number
    kind: 'SET' | 'RELEASE'
    oldScore: number | null
    newScore: number | null
    reason: string | null
    changedBy: Person
    changedAt: Date
  }[]
}

export type SupervisorScore = {
  value: number
  releasedAt: Date | null
  releasedBy: Person | null
  history: { kind: 'SET' | 'RELEASE'; oldValue: number | null; newValue: number | null; reason: string | null; by: Person; at: Date }[]
}
export type StudentScore = { value: number; releasedAt: Date } | null

// The body of GET …/score. A supervisor gets the full view (history newest
// first, then id descending). Anyone else in scope (a team student) gets null
// until release, so "no score" and "not released" look the same, and then
// only the value and the release time: no history and no reasons (D-10).
export function scoreViewFor(role: 'SUPERVISOR', row: ScoreRow | null): SupervisorScore | null
export function scoreViewFor(role: Role, row: ScoreRow | null): SupervisorScore | StudentScore
export function scoreViewFor(role: Role, row: ScoreRow | null): SupervisorScore | StudentScore {
  if (!row) return null
  if (role === 'SUPERVISOR') {
    const history = [...row.changes]
      .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime() || b.id - a.id)
      .map((c) => ({ kind: c.kind, oldValue: c.oldScore, newValue: c.newScore, reason: c.reason, by: c.changedBy, at: c.changedAt }))
    return { value: row.score, releasedAt: row.releasedAt, releasedBy: row.releasedBy, history }
  }
  return row.releasedAt ? { value: row.score, releasedAt: row.releasedAt } : null
}
