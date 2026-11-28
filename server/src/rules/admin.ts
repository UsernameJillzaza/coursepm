import type { FieldErrors } from '../http'
import type { Role } from '../generated/prisma/client'
import { hasSingleLineControl } from './text'

// F-09 Course administration rules (FR-14, BR-01). Pure functions, so the
// unit tests (TEST-09-04, 09-07, 09-11) need no database.

const COURSE_CODE = /^[A-Z0-9-]{2,20}$/
export const COURSE_CODE_MESSAGE = 'Course code must be 2–20 letters, digits or hyphens.'
export const TEAM_NAME_MESSAGE = 'Team name must be 2–80 characters.'

export type TeamInputResult =
  | { ok: true; value: { courseCode: string; name: string } }
  | { ok: false; fields: FieldErrors }

// courseCode is trimmed and upper-cased before the check, so " cpe334-demo "
// and "CPE334-DEMO" are the same team (the (courseCode, name) unique key then
// turns a duplicate into 409 TEAM_EXISTS). Unknown keys are ignored.
export function validateTeamInput(body: unknown): TeamInputResult {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  const fields: FieldErrors = {}

  const courseCode = typeof input.courseCode === 'string' ? input.courseCode.trim().toUpperCase() : ''
  if (!COURSE_CODE.test(courseCode)) fields.courseCode = COURSE_CODE_MESSAGE

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length < 2 || name.length > 80 || hasSingleLineControl(name)) fields.name = TEAM_NAME_MESSAGE

  if (Object.keys(fields).length) return { ok: false, fields }
  return { ok: true, value: { courseCode, name } }
}

const ASSIGN_MESSAGE = {
  STUDENT: 'Only an active student can be added as a member.',
  SUPERVISOR: 'Only an active supervisor can be assigned to supervise a team.',
} as const

// Members are active STUDENT users and supervisors are active SUPERVISOR
// users; an ADMIN is never assignable. No database CHECK can see the user's
// role from TeamMember / SupervisorAssignment, so this is enforced here, under
// tests (F-09 Data). `null` (no such user) gets the same message: the admin
// already sees every account, so it reveals nothing.
export function checkAssignable(
  user: { role: Role; isActive: boolean } | null,
  wanted: 'STUDENT' | 'SUPERVISOR',
): { ok: true } | { ok: false; message: string } {
  if (user && user.isActive && user.role === wanted) return { ok: true }
  return { ok: false, message: ASSIGN_MESSAGE[wanted] }
}

export type DeactivateCode = 'CANNOT_DEACTIVATE_ADMIN' | 'ALREADY_INACTIVE'

// An ADMIN (which includes the actor) can never be deactivated here, so the
// course can never lock itself out. Re-activation is not in Sprint 2.
export function checkDeactivatable(
  target: { id: number; role: Role; isActive: boolean },
  actor: { id: number },
): { ok: true } | { ok: false; code: DeactivateCode } {
  if (target.role === 'ADMIN' || target.id === actor.id) return { ok: false, code: 'CANNOT_DEACTIVATE_ADMIN' }
  if (!target.isActive) return { ok: false, code: 'ALREADY_INACTIVE' }
  return { ok: true }
}
