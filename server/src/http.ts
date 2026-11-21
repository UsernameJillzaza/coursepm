import type { Response } from 'express'

// SDS §4: every error body is { error: { code, message, fields? } }: a stable
// machine code, a safe human message, optional per-field messages. Never a
// stack trace or SQL (NFR-07).
export type FieldErrors = Record<string, string>

export function sendError(res: Response, status: number, code: string, message: string, fields?: FieldErrors) {
  return res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } })
}

// A known, expected failure with its own status and code (F-02 contract): the
// error handler answers it in the standard envelope instead of a 500.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldErrors,
  ) {
    super(message)
  }
}

// Largest value of a PostgreSQL INT4 column (every ID column is Int).
const MAX_ID = 2147483647

// Path IDs are positive integers written in plain decimal digits, no larger
// than INT4 allows; anything else is treated as "not found". Number() alone is
// not enough: it accepts "0x1", "1e0", "+1" and " 1", and a value above INT4
// makes the database query fail with a 500 (Issue #57, DEF-CP-01).
export function parseId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) return null
  const n = Number(value)
  return n <= MAX_ID ? n : null
}
