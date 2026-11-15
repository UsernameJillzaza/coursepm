import { validateFeedback } from '../../src/rules/feedback'

describe('F-06 feedback body rule (AC-06-5)', () => {
  it.each([
    ['', false],
    ['   ', false],
    [' a ', true],
    ['x'.repeat(4000), true],
    ['x'.repeat(4001), false],
  ])('validates the trimmed body boundary', (body, valid) => {
    const result = validateFeedback({ body })
    expect(result.ok).toBe(valid)
    if (valid && result.ok) expect(result.value.body).toBe(body.trim())
    if (!valid && !result.ok) expect(result.fields).toHaveProperty('body')
  })

  it('rejects missing and non-string bodies, ignoring client-supplied ownership fields', () => {
    for (const input of [{}, { body: 3 }, { body: null }]) {
      const result = validateFeedback(input)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.fields).toHaveProperty('body')
    }
    const result = validateFeedback({ body: ' Approved ', submissionId: 999, supervisorId: 999 })
    expect(result).toEqual({ ok: true, value: { body: 'Approved' } })
  })
})
