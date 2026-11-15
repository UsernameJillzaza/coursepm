import { createHash, randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import { prisma } from '../db'

// NFR-04 / SDS §5 session lifecycle.
export const SESSION_COOKIE = 'cpm_session'

export function sessionTtlMs(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS)
  return (Number.isFinite(hours) && hours > 0 ? hours : 8) * 60 * 60 * 1000
}

// The database stores only SHA-256(token): a leaked Session table can't be
// replayed as a cookie, because the cookie needs the original token.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await prisma.session.create({
    data: { id: hashToken(token), userId, expiresAt: new Date(Date.now() + sessionTtlMs()) },
  })
  return token
}

// HttpOnly (page scripts can't read it), SameSite=Lax (not sent on cross-site
// POSTs), Secure in production (local development is plain http).
function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' }
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: sessionTtlMs() })
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions())
}

// Minimal Cookie-header parser for the one cookie this API reads.
export function readSessionToken(req: Request): string | null {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1 || part.slice(0, eq).trim() !== SESSION_COOKIE) continue
    const value = decodeURIComponent(part.slice(eq + 1).trim())
    return /^[0-9a-f]{64}$/.test(value) ? value : null
  }
  return null
}

export async function deleteSession(id: string) {
  await prisma.session.deleteMany({ where: { id } })
}
