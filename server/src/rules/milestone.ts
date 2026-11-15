export type ValidMilestone = {
  title: string
  description: string
  deadline: Date
  maxRevisions: number
}

export type MilestoneValidation =
  | { ok: true; value: ValidMilestone }
  | { ok: false; fields: Record<string, string> }

// Temporary rule stub: the first TDD run must show the boundary tests failing.
export function validateMilestone(input: Record<string, unknown>, _now: Date): MilestoneValidation {
  return {
    ok: true,
    value: {
      title: String(input.title ?? ''),
      description: String(input.description ?? ''),
      deadline: new Date(String(input.deadline ?? '')),
      maxRevisions: Number(input.maxRevisions ?? 3),
    },
  }
}
