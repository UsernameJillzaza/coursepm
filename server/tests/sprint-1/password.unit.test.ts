import { hashPassword, verifyPassword } from '../../src/auth/password'

// TEST-01-06 (AC-01-5, NFR-03): salted scrypt hashes in a self-describing format.
describe('TEST-01-06 password hashing', () => {
  it('stores scrypt$N$r$p$salt$key, never the password itself', async () => {
    const hash = await hashPassword('Correct-horse-1')
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/)
    expect(hash).not.toContain('Correct-horse-1')
  })

  it('uses a fresh salt, so the same password gives different hashes', async () => {
    expect(await hashPassword('same-pass-1')).not.toBe(await hashPassword('same-pass-1'))
  })

  it('verifies the right password and rejects a wrong one or a malformed hash', async () => {
    const hash = await hashPassword('Correct-horse-1')
    expect(await verifyPassword('Correct-horse-1', hash)).toBe(true)
    expect(await verifyPassword('correct-horse-1', hash)).toBe(false)
    expect(await verifyPassword('Correct-horse-1', 'not-a-hash')).toBe(false)
  })
})
