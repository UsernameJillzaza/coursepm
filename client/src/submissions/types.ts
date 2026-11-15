// Submission and its revision-specific feedback as returned by the list API.
export type Feedback = {
  id: number
  submissionId: number
  body: string
  createdAt: string
  supervisor: { id: number; name: string }
}

export type Submission = {
  id: number
  revision: number
  title: string
  description: string
  link: string
  submittedAt: string
  submittedBy: { id: number; name: string }
  feedback: Feedback | null
}
