import express from 'express'
import path from 'node:path'
import type { NextFunction, Request, Response } from 'express'
import { AppError, sendError } from './http'
import { prisma } from './db'
import { authenticate } from './auth/middleware'
import { authRouter } from './auth/routes'
import { teamsRouter } from './teams/routes'
import { milestonesRouter } from './milestones/routes'
import { submissionsRouter } from './submissions/routes'
import { feedbackRouter } from './feedback/routes'
import { compareRouter } from './milestones/compare'
import { adminRouter } from './admin/routes'

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

// server.ts owns listen(); tests can create an app for either runtime mode.
export function createApp() {
  const app = express()
  app.use(express.json({ limit: '100kb' }))

  // Public probes run before session lookup. Liveness must not depend on DB.
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'CoursePM API' })
  })

  app.get('/api/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.status(200).json({ status: 'ready', db: 'connected' })
    } catch {
      sendError(res, 503, 'NOT_READY', 'Database unavailable.')
    }
  })

  // F-01: attach req.user from the session cookie on every request (it never
  // rejects by itself; see auth/middleware.ts), then the auth endpoints.
  app.use(authenticate)
  app.use('/api/auth', authRouter)
  app.use('/api/teams', teamsRouter) // F-03
  app.use('/api/milestones/:milestoneId/submissions', submissionsRouter) // F-05
  app.use('/api/submissions', feedbackRouter) // F-06
  app.use('/api/milestones/:milestoneId/compare', compareRouter) // F-07
  app.use('/api/milestones', milestonesRouter) // F-04
  app.use('/api/admin', adminRouter) // F-09

  // Unknown API routes answer in the standard error shape, not Express's HTML page.
  app.use('/api', (_req, res) => {
    sendError(res, 404, 'NOT_FOUND', 'Not found.')
  })

  // The image places the built client next to server/, at client/dist. In local
  // development Vite serves the client and proxies /api instead.
  if (process.env.NODE_ENV === 'production') {
    const clientDist = process.env.CLIENT_DIST_DIR
      ? path.resolve(process.env.CLIENT_DIST_DIR)
      : path.resolve(__dirname, '../../client/dist')
    app.use(express.static(clientDist))
    app.use((req, res, next) => {
      if (req.method !== 'GET' || path.extname(req.path)) return next()
      res.sendFile(path.join(clientDist, 'index.html'), (err) => {
        if (err) next(err)
      })
    })
  }

  app.use(errorHandler)

  return app
}

const app = createApp()
export default app
