import type { FieldErrors } from '../http'

// STUB (TDD step): the types and signatures exist, but no rule is enforced
// yet: every submission is accepted. The rule tests must fail against this
// before the real rules are written.
export type SubmitState = { deadline: Date; maxRevisions: number; revisionsUsed: number; now: Date }
export type SubmitCheck = { ok: true; nextRevision: number } | { ok: false; code: 'DEADLINE_PASSED' | 'REVISION_LIMIT_REACHED' }

export function checkCanSubmit(state: SubmitState): SubmitCheck {
  return { ok: true, nextRevision: state.revisionsUsed + 1 }
}

export type SubmissionInput = { title: string; description: string; link: string }

export function validateSubmission(input: Record<string, unknown>): { ok: true; value: SubmissionInput } | { ok: false; fields: FieldErrors } {
  return {
    ok: true,
    value: { title: String(input.title ?? '').trim(), description: String(input.description ?? '').trim(), link: String(input.link ?? '') },
  }
}
