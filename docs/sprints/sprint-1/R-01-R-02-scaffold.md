# R-01 / R-02 Sprint 1 scaffold — engineering contract

Version 1.0 · 2026-11-15 · Issue: #3 · Links: NFR-06, NFR-07, NFR-10.

This is the Sprint 1 setup slice of R-01 (delivery responsibility) and R-02 (shared UI conventions).
Docker, CI/CD and GCP deployment remain allocated to Lab 5 / Sprint 2 in the system SDS and sprint plan.
The scaffold PR follows the Part E contract PR and precedes F-01 implementation.

## Behavior and layers

- **API:** `GET /api/health` is public and returns `200 { "status": "ok" }`. An unknown `/api/*`
  path returns `404 { "error": { "code": "NOT_FOUND", "message": "Not found" } }` through the
  shared error handler. Unexpected errors use the same error envelope without stack or SQL details.
- **Database and test configuration:** the server reads `DATABASE_URL` for normal operation. API and
  database integration tests require `DATABASE_URL_TEST` and connect only to that database. Test setup
  fails before migrations, seed or cleanup if the test URL is missing or resolves to the same database
  as `DATABASE_URL`. In this scaffold PR, connect with the test URL and verify the selected database
  using `SELECT current_database()`; domain writes begin after F-01 adds the first migration. The
  development database must not be reset or written by test setup.
- **UI:** the starter app requests `/api/health` and displays a visible API status: `API online` on
  success, `API unavailable` on request failure or an unhealthy response. It shows a loading state
  until the check finishes. The client build must succeed.
- **Data:** the health endpoint and API status require no domain tables or migration. Prisma schema,
  migrations and repeatable seed are introduced by F-01/F-03; this scaffold establishes their separate
  test-database configuration.

## Acceptance criteria

| ID | Given / When / Then |
| --- | --- |
| AC-R01-1 | Without a session, `GET /api/health` returns 200 `{ "status": "ok" }`. |
| AC-R01-2 | With distinct development and test databases, the integration test connection selects the test database; setup refuses a missing `DATABASE_URL_TEST` or one pointing to the development database before any migration, seed or cleanup. |
| AC-R01-3 | An unknown `/api/*` route returns 404 `NOT_FOUND` in the standard error shape without internal details. |
| AC-R02-1 | The client build succeeds; the starter app shows loading, `API online`, and `API unavailable` states for the health request. |

The planned checks are TEST-R01-01 through TEST-R01-03 and TEST-R02-01 in [sts.md](sts.md).
