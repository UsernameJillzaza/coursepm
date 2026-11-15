import { validateMilestone } from '../../src/rules/milestone'

const now = new Date('2026-11-15T08:00:00.000Z')
const future = '2026-11-22T08:00:00.000Z'

function input(overrides: Record<string, unknown> = {}) {
  return { title: 'Proposal', description: 'First draft', deadline: future, maxRevisions: 3, ...overrides }
}

describe('TEST-04-04 (AC-04-4): milestone validation boundaries', () => {
  it.each([
    ['ab', false],
    ['abc', true],
    ['x'.repeat(120), true],
    ['x'.repeat(121), false],
  ])('checks the trimmed title length for %s', (title, valid) => {
    const result = validateMilestone(input({ title: ` ${title} ` }), now)
    expect(result.ok).toBe(valid)
    if (valid && result.ok) expect(result.value.title).toBe(title)
    if (!valid && !result.ok) expect(result.fields).toHaveProperty('title')
  })

  it.each([
    [0, false],
    [1, true],
    [5, true],
    [6, false],
    [1.5, false],
  ])('checks maxRevisions = %s', (maxRevisions, valid) => {
    const result = validateMilestone(input({ maxRevisions }), now)
    expect(result.ok).toBe(valid)
    if (valid && result.ok) expect(result.value.maxRevisions).toBe(maxRevisions)
    if (!valid && !result.ok) expect(result.fields).toHaveProperty('maxRevisions')
  })

  it('defaults the omitted revision limit to 3', () => {
    const { maxRevisions: _omitted, ...withoutLimit } = input()
    const result = validateMilestone(withoutLimit, now)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.maxRevisions).toBe(3)
  })

  it('rejects deadlines at or before now, invalid dates, and descriptions above 2,000 characters', () => {
    for (const deadline of [now.toISOString(), '2026-11-15T07:59:59.999Z', 'not-a-date', '2026-02-31T08:00:00.000Z']) {
      const result = validateMilestone(input({ deadline }), now)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.fields).toHaveProperty('deadline')
    }
    const result = validateMilestone(input({ description: 'x'.repeat(2001) }), now)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.fields).toHaveProperty('description')
    const accepted = validateMilestone(input({ description: 'x'.repeat(2000) }), now)
    expect(accepted.ok).toBe(true)
  })

  it('returns every failing field together', () => {
    const result = validateMilestone(input({ title: 'ab', deadline: 'invalid', maxRevisions: 0 }), now)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.fields).sort()).toEqual(['deadline', 'maxRevisions', 'title'])
  })
})
