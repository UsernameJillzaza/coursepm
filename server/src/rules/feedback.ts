export type FeedbackValidation =
  | { ok: true; value: { body: string } }
  | { ok: false; fields: Record<string, string> }

export function validateFeedback(input: unknown): FeedbackValidation {
  const raw = input && typeof input === 'object' && !Array.isArray(input) && 'body' in input
    ? input.body
    : undefined
  const body = typeof raw === 'string' ? raw.trim() : ''
  if (body.length < 1 || body.length > 4000) {
    return { ok: false, fields: { body: 'Feedback must be 1–4,000 characters.' } }
  }
  return { ok: true, value: { body } }
}
