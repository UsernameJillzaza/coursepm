import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { sendError } from './http'
import { authenticate } from './auth/middleware'
import { authRouter } from './auth/routes'

// The app is exported without listen() so Supertest can import it; server.ts
// owns listen().
const app = express()
app.use(express.json())

// F-01: attach req.user from the session cookie on every request (it never
// rejects by itself; see auth/middleware.ts), then the auth endpoints.
app.use(authenticate)
app.use('/api/auth', authRouter)

// GET /api/health — public liveness check (SDS §4).
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'CoursePM API' })
})

// Unknown API routes answer in the standard error shape, not Express's HTML page.
app.use('/api', (_req, res) => {
  sendError(res, 404, 'NOT_FOUND', 'Not found.')
})

// Last-resort error handler (Express 5 forwards rejected async handlers here):
// unexpected errors use the standard envelope with no stack or SQL (R-01).
// Mapping request-body errors to 400/413 and exporting the handler for
// TEST-02-06 belong to F-02 (Issue #5).
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  return sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected server error.')
})

export default app
