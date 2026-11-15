import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { AppError, sendError } from './http'

// The app is exported without listen() so Supertest can import it; server.ts
// owns listen().
const app = express()
app.use(express.json({ limit: '100kb' }))

// GET /api/health — public liveness check (SDS §4).
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'CoursePM API' })
})

// Unknown API routes answer in the standard error shape, not Express's HTML page.
app.use('/api', (_req, res) => {
  sendError(res, 404, 'NOT_FOUND', 'Not found.')
})

// Last-resort error handler (Express 5 forwards rejected async handlers here).
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) return sendError(res, err.status, err.code, err.message, err.fields)
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Malformed JSON body.')
  }
  console.error(err)
  return sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected server error.')
})

export default app
