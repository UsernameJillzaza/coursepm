// STUB (TDD step): the signature exists, but nothing is checked yet. The
// TEST-R01-02 tests must fail against this before the real guard is written.
export function assertSeparateTestDatabase(_devUrl: string | undefined, testUrl: string | undefined): { database: string } {
  return { database: new URL(String(testUrl)).pathname.slice(1) }
}
