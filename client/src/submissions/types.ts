// F-05 submission as returned by GET /api/milestones/:id/submissions. The
// feedback slot is null until F-06 (#8) adds feedback.
export type Submission = {
  id: number
  revision: number
  title: string
  description: string
  link: string
  submittedAt: string
  submittedBy: { id: number; name: string }
  feedback: null
}
