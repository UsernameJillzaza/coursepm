import { Router } from 'express'
import { prisma } from '../db'
import { sendError, type FieldErrors } from '../http'
import { getDummyHash, verifyPassword } from './password'
import { clearSessionCookie, createSession, deleteSession, hashToken, readSessionToken, setSessionCookie } from './session'
import { publicUser, requireAuth } from './middleware'

export const authRouter = Router()

// F-01 contract: one generic message for every credential failure (AC-01-2).
const INVALID_CREDENTIALS = 'E-mail or password is incorrect.'

// POST /api/auth/login (FR-01). Only email and password are read from the
// body; anything else, such as "role", is ignored (AC-01-6).
authRouter.post('/login', async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown }
  const fields: FieldErrors = {}
  if (typeof email !== 'string' || email.trim() === '') fields.email = 'E-mail is required.'
  if (typeof password !== 'string' || password === '') fields.password = 'Password is required.'
  if (Object.keys(fields).length) return sendError(res, 400, 'VALIDATION_ERROR', 'Check the highlighted fields.', fields)

  const user = await prisma.user.findUnique({ where: { email: (email as string).trim().toLowerCase() } })
  // Always run a full scrypt check (against a dummy hash for an unknown
  // e-mail), so timing doesn't reveal which accounts exist.
  const matches = await verifyPassword(password as string, user?.passwordHash ?? (await getDummyHash()))
  if (!user || !user.isActive || !matches) {
    return sendError(res, 401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS)
  }

  // Logging in again replaces the session this browser already had.
  const previous = readSessionToken(req)
  if (previous) await deleteSession(hashToken(previous))

  setSessionCookie(res, await createSession(user.id))
  res.status(200).json({ user: publicUser(user) })
})

// POST /api/auth/logout (FR-02, AC-01-4): delete the server-side session so
// the old cookie is worthless. Idempotent: 204 even without a session.
authRouter.post('/logout', async (req, res) => {
  if (req.sessionId) await deleteSession(req.sessionId)
  clearSessionCookie(res)
  res.status(204).end()
})

// GET /api/auth/me (FR-02, AC-01-3).
authRouter.get('/me', requireAuth, (req, res) => {
  res.status(200).json({ user: req.user })
})
