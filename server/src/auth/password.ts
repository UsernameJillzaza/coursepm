import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

// NFR-03 / SDS §5: scrypt from node:crypto (memory-hard, and no native module
// to compile on Windows). The parameters are stored inside every hash, so they
// can be raised later without invalidating existing passwords.
const N = 16384
const R = 8
const P = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16
const MAX_MEM = 64 * 1024 * 1024

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltB64, keyB64] = parts
  const expected = Buffer.from(keyB64, 'base64')
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEM,
  })
  // Constant-time compare, so response time doesn't leak matching bytes.
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// For an unknown e-mail, login still verifies against this throwaway hash, so
// response time doesn't reveal whether an account exists (SDS §5).
let dummyHash: Promise<string> | null = null
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
  return dummyHash
}
