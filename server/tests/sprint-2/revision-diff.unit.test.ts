import { compareRevisions, diffWords, parseRevisionPair } from '../../src/rules/revisionDiff'

// F-07 Revision history and comparison: pure rule functions in rules/revisionDiff.ts.
// Sprint 2 STS TEST-07-01 (AC-07-3) and TEST-07-02 (AC-07-4).

type Part = { op: 'same' | 'removed' | 'added'; text: string }
const join = (parts: Part[], ops: Part['op'][]) => parts.filter((p) => ops.includes(p.op)).map((p) => p.text).join('')
const oldSide = (parts: Part[]) => join(parts, ['same', 'removed'])
const newSide = (parts: Part[]) => join(parts, ['same', 'added'])
const noNeighbourWithSameOp = (parts: Part[]) => parts.every((p, i) => i === 0 || parts[i - 1].op !== p.op)

describe('TEST-07-01 (AC-07-3): diffWords', () => {
  const pairs: [string, string, string][] = [
    ['equal texts', 'Draft of the SRS', 'Draft of the SRS'],
    ['the SRS pair', 'Draft of the SRS', 'Final draft of the SRS v2'],
    ['empty → text', '', 'New text here'],
    ['text → empty', 'Old text here', ''],
    ['spacing only', 'one two  three', 'one  two three'],
    ['line breaks', 'line one\nline two', 'line one\n\nline three'],
    ['Thai text with spaces', 'รายงาน ฉบับ ร่าง', 'รายงาน ฉบับ สมบูรณ์'],
    ['reordered words', 'a b c d', 'd c b a'],
  ]

  it.each(pairs)('%s: same+removed rebuilds the old text and same+added the new text, exactly', (_label, oldText, newText) => {
    const parts = diffWords(oldText, newText)
    expect(oldSide(parts)).toBe(oldText)
    expect(newSide(parts)).toBe(newText)
    expect(noNeighbourWithSameOp(parts)).toBe(true)
    expect(parts.every((p) => p.text.length > 0)).toBe(true)
  })

  it('the documented SRS pair: Draft removed, Final draft and v2 added, of the SRS same', () => {
    expect(diffWords('Draft of the SRS', 'Final draft of the SRS v2')).toEqual([
      { op: 'removed', text: 'Draft' },
      { op: 'added', text: 'Final draft' },
      { op: 'same', text: ' of the SRS' },
      { op: 'added', text: ' v2' },
    ])
  })

  it('equal texts give one same part; two empty texts give no parts', () => {
    expect(diffWords('Draft of the SRS', 'Draft of the SRS')).toEqual([{ op: 'same', text: 'Draft of the SRS' }])
    expect(diffWords('', '')).toEqual([])
  })

  it('words compare case-sensitively', () => {
    expect(diffWords('draft', 'Draft')).toEqual([
      { op: 'removed', text: 'draft' },
      { op: 'added', text: 'Draft' },
    ])
  })

  it('stays exact and quick for two 2,000-character descriptions (BR-08 maximum)', () => {
    const words = (seed: number) => Array.from({ length: 400 }, (_, i) => `w${(i * seed) % 97}`).join(' ').slice(0, 2000)
    const a = words(7)
    const b = words(11)
    const started = performance.now()
    const parts = diffWords(a, b)
    const elapsed = performance.now() - started
    expect(oldSide(parts)).toBe(a)
    expect(newSide(parts)).toBe(b)
    expect(elapsed).toBeLessThan(500)
  })
})

describe('TEST-07-02 (AC-07-4): parseRevisionPair', () => {
  it('puts the smaller number first, whatever the order', () => {
    expect(parseRevisionPair({ a: '1', b: '3' })).toEqual({ ok: true, older: 1, newer: 3 })
    expect(parseRevisionPair({ a: '3', b: '1' })).toEqual({ ok: true, older: 1, newer: 3 })
  })

  it.each([
    ['a missing', { b: '3' }, { a: 'Choose a revision number.' }],
    ['b missing', { a: '1' }, { b: 'Choose a revision number.' }],
    ['a = 0', { a: '0', b: '3' }, { a: 'Choose a revision number.' }],
    ['a = abc', { a: 'abc', b: '3' }, { a: 'Choose a revision number.' }],
    ['a = 01', { a: '01', b: '3' }, { a: 'Choose a revision number.' }],
    ['a = 1e0', { a: '1e0', b: '3' }, { a: 'Choose a revision number.' }],
    ['a = +1', { a: '+1', b: '3' }, { a: 'Choose a revision number.' }],
    ['a = 2147483648', { a: '2147483648', b: '3' }, { a: 'Choose a revision number.' }],
    ['a repeated (an array)', { a: ['1', '2'], b: '3' }, { a: 'Choose a revision number.' }],
    ['both missing', {}, { a: 'Choose a revision number.', b: 'Choose a revision number.' }],
    ['a = b', { a: '2', b: '2' }, { b: 'Choose two different revisions.' }],
  ])('%s → fields', (_label, query, fields) => {
    expect(parseRevisionPair(query)).toEqual({ ok: false, fields })
  })
})

describe('compareRevisions (AC-07-3)', () => {
  const r = (title: string, link: string, description: string) => ({ title, link, description })

  it('marks title and link as whole values and the description word by word', () => {
    const result = compareRevisions(
      r('SRS', 'https://example.com/v1', 'Draft of the SRS'),
      r('SRS', 'https://example.com/v3', 'Final draft of the SRS v2'),
    )
    expect(result.title).toEqual({ changed: false })
    expect(result.link).toEqual({ changed: true })
    expect(result.description.changed).toBe(true)
    expect(result.description.parts).toEqual(diffWords('Draft of the SRS', 'Final draft of the SRS v2'))
  })

  it('equal descriptions → changed false with one same part', () => {
    const result = compareRevisions(r('A', 'https://x.test/1', 'Same text'), r('B', 'https://x.test/1', 'Same text'))
    expect(result.title).toEqual({ changed: true })
    expect(result.link).toEqual({ changed: false })
    expect(result.description).toEqual({ changed: false, parts: [{ op: 'same', text: 'Same text' }] })
  })
})
