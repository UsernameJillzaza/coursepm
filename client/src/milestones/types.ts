export type Milestone = {
  id: number
  teamId: number
  title: string
  description: string
  deadline: string
  maxRevisions: number
  createdById: number
  createdAt: string
  revisionsUsed: number
  status: 'OPEN' | 'CLOSED'
  latestSubmittedAt: string | null
  // CHG-01 (#74): true when a revision exists and the latest has no feedback,
  // computed by the server (F-04 v1.1); the student must wait for feedback.
  awaitingFeedback: boolean
}

export function bangkokTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value)).replace(',', '')
}
