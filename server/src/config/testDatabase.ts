// AC-R01-2: integration tests may only ever touch the test database. This
// guard runs in test setup BEFORE any migration, seed or cleanup and refuses
// a missing DATABASE_URL_TEST, or one that resolves to the same database as
// DATABASE_URL, however the URL is spelled (query parameters, localhost vs
// 127.0.0.1, default port written or omitted, letter case of the host).

type DatabaseIdentity = { host: string; port: string; database: string }

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function identify(url: string, name: string): DatabaseIdentity {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`${name} is not a valid PostgreSQL URL.`)
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`${name} is not a valid PostgreSQL URL.`)
  }
  const host = parsed.hostname.toLowerCase()
  return {
    host: LOOPBACK.has(host) ? 'loopback' : host,
    port: parsed.port || '5432',
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
  }
}

export function assertSeparateTestDatabase(devUrl: string | undefined, testUrl: string | undefined): { database: string } {
  if (!testUrl || testUrl.trim() === '') {
    throw new Error('DATABASE_URL_TEST is not set (see server/.env.example). Refusing to run tests.')
  }
  const test = identify(testUrl.trim(), 'DATABASE_URL_TEST')
  if (!test.database) throw new Error('DATABASE_URL_TEST is not a valid PostgreSQL URL (no database name).')
  // Without the development URL the two databases cannot be compared, so the
  // safe answer is to refuse rather than to skip the check.
  if (!devUrl || devUrl.trim() === '') {
    throw new Error('DATABASE_URL is not set, so the test database cannot be checked against it. Refusing to run tests.')
  }
  const dev = identify(devUrl.trim(), 'DATABASE_URL')
  if (dev.host === test.host && dev.port === test.port && dev.database === test.database) {
    throw new Error(
      `DATABASE_URL_TEST points to the same database as DATABASE_URL ("${test.database}"). ` +
        'Use a separate test database; refusing to migrate or write to the development data.',
    )
  }
  return { database: test.database }
}
