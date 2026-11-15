import type { Response } from 'express'

// SDS §4: every error body is { error: { code, message, fields? } }: a stable
// machine code, a safe human message, optional per-field messages. Never a
// stack trace or SQL (NFR-07).
export type FieldErrors = Record<string, string>

export function sendError(res: Response, status: number, code: string, message: string, fields?: FieldErrors) {
  return res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } })
}
