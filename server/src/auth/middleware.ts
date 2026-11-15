import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../db'
import { sendError } from '../http'
import type { Role } from '../generated/prisma/client'
import { deleteSession, hashToken, readSessionToken } from './session'

export type AuthUser = { id: number; name: string; email: string; role: Role }

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
    sessionId?: string
  }
}

// The only user fields that ever leave the server (AC-01-5: never the hash).
export function publicUser(user: AuthUser): AuthUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role }
}

// Runs on every request and never rejects: it only sets req.user when the
// cookie maps to a live session of an active user. Rejecting is the job of
// requireAuth/requireRole. The user row (and so the role) is re-read from
// the database on every request; the client never supplies it (AC-01-6).
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = readSessionToken(req)
  if (!token) return next()

  const id = hashToken(token)
  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } })
  if (!session) return next()

  if (session.expiresAt.getTime() <= Date.now()) {
    await deleteSession(id) // AC-01-7: an expired session is removed when next seen
    return next()
  }
  if (!session.user.isActive) return next()

  req.user = publicUser(session.user)
  req.sessionId = id
  next()
}

// NFR-01: 401 for any protected route without a valid session.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return sendError(res, 401, 'UNAUTHENTICATED', 'Please log in.')
  next()
}

// NFR-02 / D-03: there is deliberately no role middleware. Every Sprint 1
// route that checks a role targets a record, so each handler first loads the
// record through the scope helpers (404 when missing or out of scope) and only
// then checks the role for its operation (403). See F-02 contract.
