import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { AppError, sendError } from './http'
import { authenticate } from './auth/middleware'
import { authRouter } from './auth/routes'
import { teamsRouter } from './teams/routes'
import { milestonesRouter } from './milestones/routes'
import { submissionsRouter } from './submissions/routes'
import { feedbackRouter } from './feedback/routes'

// The app is exported without listen() so Supertest can import it; server.ts
// owns listen().
const app = express()
app.use(express.json({ limit: '100kb' }))

// F-01: attach req.user from the session cookie on every request (it never
// rejects by itself; see auth/middleware.ts), then the auth endpoints.
app.use(authenticate)
app.use('/api/auth', authRouter)
app.use('/api/teams', teamsRouter) // F-03
app.use('/api/milestones/:milestoneId/submissions', submissionsRouter) // F-05
app.use('/api/submissions', feedbackRouter) // F-06
app.use('/api/milestones', milestonesRouter) // F-04

// GET /api/health — public liveness check (SDS §4).
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'CoursePM API' })
})

// Unknown API routes answer in the standard error shape, not Express's HTML page.
app.use('/api', (_req, res) => {
  sendError(res, 404, 'NOT_FOUND', 'Not found.')
})

// Last-resort error handler (Express 5 forwards rejected async handlers here).
// NFR-07: details go to the server log only; the client gets the standard
// envelope. Exported so TEST-02-06 can exercise it from a probe app, with no
// test-only route in the application (AC-02-6).
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) return sendError(res, err.status, err.code, err.message, err.fields)
  const errorType = err && typeof err === 'object' && 'type' in err ? err.type : undefined
  // AC-02-8: request-body problems are the client's error, not a 500.
  if (errorType === 'entity.parse.failed') {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Malformed JSON body.')
  }
  if (errorType === 'entity.too.large') {
    return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'The request body is too large (limit 100 kB).')
  }
  console.error(err)
  return sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected server error.')
}
app.use(errorHandler)

export default app
