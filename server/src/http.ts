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

// Path IDs are positive integers; anything else is treated as "not found".
export function parseId(value: unknown): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}
