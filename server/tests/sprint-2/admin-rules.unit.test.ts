import { checkAssignable, checkDeactivatable, validateTeamInput } from '../../src/rules/admin'

// F-09 Course administration: pure rule functions in rules/admin.ts.
// Sprint 2 STS TEST-09-04 (AC-09-4), TEST-09-07 (AC-09-6), TEST-09-11 (AC-09-8).

const NUL = String.fromCharCode(0)

describe('TEST-09-04 (AC-09-4): validateTeamInput', () => {
  const validName = 'Team Delta'

  it.each([
    ['1 character', 'C'],
    ['21 characters', 'C'.repeat(21)],
    ['a space inside', 'CPE 334'],
    ['an underscore', 'CPE_334'],
    ['a missing value', undefined],
    ['a non-string value', 334],
  ])('rejects a course code with %s', (_label, courseCode) => {
    const result = validateTeamInput({ courseCode, name: validName })
    expect(result).toEqual({ ok: false, fields: { courseCode: 'Course code must be 2–20 letters, digits or hyphens.' } })
  })

  it.each([
    ['1 character', 'T'],
    ['81 characters', 'T'.repeat(81)],
    ['a NUL byte', `Team${NUL}Delta`],
    ['a missing value', undefined],
    ['only spaces', '   '],
  ])('rejects a team name with %s', (_label, name) => {
    const result = validateTeamInput({ courseCode: 'CPE334-DEMO', name })
    expect(result).toEqual({ ok: false, fields: { name: 'Team name must be 2–80 characters.' } })
  })

  it('reports both fields at once', () => {
    const result = validateTeamInput({ courseCode: 'C', name: 'T' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.fields).sort()).toEqual(['courseCode', 'name'])
  })

  it.each([
    ['2-character code', 'AB', 'AB'],
    ['20-character code', 'A'.repeat(20), 'A'.repeat(20)],
    ['lower case with spaces around it, trimmed and upper-cased', ' cpe334-demo ', 'CPE334-DEMO'],
  ])('accepts a %s', (_label, courseCode, expected) => {
    expect(validateTeamInput({ courseCode, name: validName })).toEqual({ ok: true, value: { courseCode: expected, name: validName } })
  })

  it.each([
    ['2 characters', 'TD'],
    ['80 characters', 'T'.repeat(80)],
  ])('accepts a name of %s, and trims it', (_label, name) => {
    expect(validateTeamInput({ courseCode: 'AB', name: `  ${name}  ` })).toEqual({ ok: true, value: { courseCode: 'AB', name } })
  })

  it('ignores unknown keys and a body that is not an object', () => {
    expect(validateTeamInput({ courseCode: 'AB', name: 'TD', id: 5, members: [1] })).toEqual({ ok: true, value: { courseCode: 'AB', name: 'TD' } })
    expect(validateTeamInput(null).ok).toBe(false)
    expect(validateTeamInput(['AB', 'TD']).ok).toBe(false)
  })
})

describe('TEST-09-07 (AC-09-6): checkAssignable', () => {
  const MEMBER_MESSAGE = 'Only an active student can be added as a member.'
  const SUPERVISOR_MESSAGE = 'Only an active supervisor can be assigned to supervise a team.'
  const student = { role: 'STUDENT' as const, isActive: true }
  const supervisor = { role: 'SUPERVISOR' as const, isActive: true }
  const admin = { role: 'ADMIN' as const, isActive: true }
  const inactiveStudent = { role: 'STUDENT' as const, isActive: false }
  const inactiveSupervisor = { role: 'SUPERVISOR' as const, isActive: false }

  it('accepts only an active student as a member', () => {
    expect(checkAssignable(student, 'STUDENT')).toEqual({ ok: true })
    for (const user of [supervisor, admin, inactiveStudent, null]) {
      expect(checkAssignable(user, 'STUDENT')).toEqual({ ok: false, message: MEMBER_MESSAGE })
    }
  })

  it('accepts only an active supervisor as a supervisor', () => {
    expect(checkAssignable(supervisor, 'SUPERVISOR')).toEqual({ ok: true })
    for (const user of [student, admin, inactiveSupervisor, null]) {
      expect(checkAssignable(user, 'SUPERVISOR')).toEqual({ ok: false, message: SUPERVISOR_MESSAGE })
    }
  })
})

describe('TEST-09-11 (AC-09-8): checkDeactivatable', () => {
  const actor = { id: 1, role: 'ADMIN' as const, isActive: true }

  it('allows an active student or supervisor', () => {
    expect(checkDeactivatable({ id: 2, role: 'STUDENT', isActive: true }, actor)).toEqual({ ok: true })
    expect(checkDeactivatable({ id: 3, role: 'SUPERVISOR', isActive: true }, actor)).toEqual({ ok: true })
  })

  it('refuses an inactive account', () => {
    expect(checkDeactivatable({ id: 4, role: 'SUPERVISOR', isActive: false }, actor)).toEqual({ ok: false, code: 'ALREADY_INACTIVE' })
  })

  it('refuses another admin and the actor itself', () => {
    expect(checkDeactivatable({ id: 5, role: 'ADMIN', isActive: true }, actor)).toEqual({ ok: false, code: 'CANNOT_DEACTIVATE_ADMIN' })
    expect(checkDeactivatable(actor, actor)).toEqual({ ok: false, code: 'CANNOT_DEACTIVATE_ADMIN' })
  })
})
