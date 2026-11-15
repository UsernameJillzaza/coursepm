export type FeedbackValidation =
  | { ok: true; value: { body: string } }
  | { ok: false; fields: Record<string, string> }

// Temporary TDD stub; the first test run records the missing BR-10 boundary.
export function validateFeedback(input: unknown): FeedbackValidation {
  const body = input && typeof input === 'object' && 'body' in input
    ? String(input.body)
    : ''
  return { ok: true, value: { body } }
}
