import { prisma } from '../../src/db'
import { assertSeparateTestDatabase } from '../../src/config/testDatabase'
import { runGlobalSetup } from '../global-setup'

// TEST-R01-02 (AC-R01-2): integration tests use only the test database, and
// setup refuses a missing or unsafe DATABASE_URL_TEST before any migration.
const DEV = 'postgresql://app:secret@localhost:5432/coursepm?schema=public'
const TEST = 'postgresql://app:secret@localhost:5432/coursepm_test?schema=public'

afterAll(async () => {
  await prisma.$disconnect()
})

describe('TEST-R01-02 assertSeparateTestDatabase', () => {
  it('accepts a test database that differs from the development one and returns its name', () => {
    expect(assertSeparateTestDatabase(DEV, TEST)).toEqual({ database: 'coursepm_test' })
  })

  it('refuses a missing or empty DATABASE_URL_TEST', () => {
    expect(() => assertSeparateTestDatabase(DEV, undefined)).toThrow(/DATABASE_URL_TEST is not set/)
    expect(() => assertSeparateTestDatabase(DEV, '  ')).toThrow(/DATABASE_URL_TEST is not set/)
  })

  it.each([
    ['the identical URL', DEV],
    ['the same database with different query parameters', 'postgresql://app:secret@localhost:5432/coursepm'],
    ['the same database through 127.0.0.1', 'postgresql://app:secret@127.0.0.1:5432/coursepm?schema=public'],
    ['the same database with the default port omitted', 'postgresql://other:pw@LOCALHOST/coursepm'],
  ])('refuses %s as the test database', (_label, url) => {
    expect(() => assertSeparateTestDatabase(DEV, url)).toThrow(/same database as DATABASE_URL/)
  })

  it('refuses a test URL that is not a PostgreSQL URL', () => {
    expect(() => assertSeparateTestDatabase(DEV, 'not a url')).toThrow(/not a valid PostgreSQL URL/)
  })
})

describe('TEST-R01-02 global setup', () => {
  it('fails before running any migration when the test URL is missing or points to the dev database', () => {
    for (const env of [{ DATABASE_URL: DEV }, { DATABASE_URL: DEV, DATABASE_URL_TEST: DEV }]) {
      const exec = vi.fn()
      expect(() => runGlobalSetup(env, exec)).toThrow()
      expect(exec).not.toHaveBeenCalled()
    }
  })

  it('migrates only the test database when the configuration is valid', () => {
    const exec = vi.fn()
    runGlobalSetup({ DATABASE_URL: DEV, DATABASE_URL_TEST: TEST }, exec)
    expect(exec).toHaveBeenCalledTimes(1)
    expect(exec.mock.calls[0][1].env.DATABASE_URL).toBe(TEST)
  })
})

describe('TEST-R01-02 the test connection really selects the test database', () => {
  it('SELECT current_database() returns the DATABASE_URL_TEST database, not the development one', async () => {
    // vitest.config keeps the original development URL as DATABASE_URL_DEV,
    // because it points DATABASE_URL at the test database for the app code.
    expect(process.env.DATABASE_URL_DEV).toBeTruthy()
    const expected = new URL(process.env.DATABASE_URL_TEST!).pathname.slice(1)
    const dev = new URL(process.env.DATABASE_URL_DEV!).pathname.slice(1)
    const rows = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`
    expect(rows[0].current_database).toBe(expected)
    expect(rows[0].current_database).not.toBe(dev)
  })
})
