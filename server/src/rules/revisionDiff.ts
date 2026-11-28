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

// A kept word always outweighs every kept whitespace run together: a text of
// at most 2,000 characters (BR-08) has fewer than 4,096 whitespace tokens.
const WORD_WEIGHT = 4096

// Word diff by a weighted longest common subsequence over words and the
// whitespace between them. dp[i][j] = best score of old[i..] and new[j..],
// where a matched word scores WORD_WEIGHT and matched whitespace scores 1, so
// the kept words are always a longest common subsequence of the two word lists
// (an unchanged word is never shown as removed and added just because the
// spaces around it changed; PR #83 review), and whitespace only breaks ties.
// Walking forward, an equal token is "same" when that is optimal, except that
// matching whitespace is skipped when skipping costs nothing: that keeps a
// changed phrase together ("Final draft" rather than "Final", " ", "draft").
// Neighbouring parts with the same op are merged. The table has at most about
// 2,000 × 2,000 cells of 32 bits.
export function diffWords(oldText: string, newText: string): DiffPart[] {
  const a = tokenize(oldText)
  const b = tokenize(newText)
  const width = b.length + 1
  const dp = new Uint32Array((a.length + 1) * width)
  const at = (i: number, j: number) => dp[i * width + j]
  const weight = (token: string) => (isSpace(token) ? 1 : WORD_WEIGHT)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const skip = Math.max(at(i + 1, j), at(i, j + 1))
      dp[i * width + j] = a[i] === b[j] ? Math.max(at(i + 1, j + 1) + weight(a[i]), skip) : skip
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
    if (a[i] === b[j] && here === at(i + 1, j + 1) + weight(a[i])) {
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
