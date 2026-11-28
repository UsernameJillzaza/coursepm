import type { FieldErrors } from '../http'
import { parseId } from '../http'

// F-07 Revision history and comparison (FR-11). Pure functions, unit-tested
// in TEST-07-01 / TEST-07-02. Nothing is stored: a comparison is computed on
// request from revisions that are never changed (BR-07).

export type PairResult = { ok: true; older: number; newer: number } | { ok: false; fields: FieldErrors }

const CHOOSE = 'Choose a revision number.'

// a and b are each required canonical positive integers (the parseId format,
// so 01, 1e0, +1 and 2147483648 are rejected, and so is a repeated key, which
// Express gives as an array). They must differ; the smaller becomes `older`.
export function parseRevisionPair(query: Record<string, unknown>): PairResult {
  const a = parseId(query.a)
  const b = parseId(query.b)
  const fields: FieldErrors = {}
  if (!a) fields.a = CHOOSE
  if (!b) fields.b = CHOOSE
  if (a && b && a === b) fields.b = 'Choose two different revisions.'
  if (Object.keys(fields).length) return { ok: false, fields }
  return { ok: true, older: Math.min(a!, b!), newer: Math.max(a!, b!) }
}

export type DiffPart = { op: 'same' | 'removed' | 'added'; text: string }

const isSpace = (token: string) => /^\s/.test(token)

// Splits text into words and the whitespace between them, keeping every
// character, so the parts always rebuild both texts exactly.
function tokenize(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? []
}

// Word diff by longest common subsequence. dp[i][j] = LCS length of
// old[i..] and new[j..]. Walking forward, an equal token is "same" when that
// is optimal, except that a matching whitespace token is skipped when skipping
// costs nothing: that keeps a changed phrase together ("Final draft" rather
// than "Final", " ", "draft"). Neighbouring parts with the same op are merged.
// Descriptions are at most 2,000 characters (BR-08), so the quadratic table
// (at most about 2,000 × 2,000 cells of 16 bits) stays small.
export function diffWords(oldText: string, newText: string): DiffPart[] {
  const a = tokenize(oldText)
  const b = tokenize(newText)
  const width = b.length + 1
  const dp = new Uint16Array((a.length + 1) * width)
  const at = (i: number, j: number) => dp[i * width + j]
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i * width + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
    }
  }

  const parts: DiffPart[] = []
  const push = (op: DiffPart['op'], text: string) => {
    const last = parts[parts.length - 1]
    if (last && last.op === op) last.text += text
    else parts.push({ op, text })
  }

  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const here = at(i, j)
    if (a[i] === b[j] && here === at(i + 1, j + 1) + 1) {
      if (isSpace(a[i]) && at(i, j + 1) === here) push('added', b[j++])
      else if (isSpace(a[i]) && at(i + 1, j) === here) push('removed', a[i++])
      else {
        push('same', a[i])
        i++
        j++
      }
    } else if (at(i + 1, j) >= at(i, j + 1)) push('removed', a[i++])
    else push('added', b[j++])
  }
  while (i < a.length) push('removed', a[i++])
  while (j < b.length) push('added', b[j++])
  return parts
}

type Comparable = { title: string; link: string; description: string }

// Values are compared exactly as stored (F-05 trims them at submit time).
export function compareRevisions(older: Comparable, newer: Comparable) {
  return {
    title: { changed: older.title !== newer.title },
    link: { changed: older.link !== newer.link },
    description: { changed: older.description !== newer.description, parts: diffWords(older.description, newer.description) },
  }
}
