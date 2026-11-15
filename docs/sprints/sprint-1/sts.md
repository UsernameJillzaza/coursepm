# Sprint 1 — Software Test Specification (STS)

Version 1.0 · 2026-11-15. Levels: **U** = unit (Vitest, no DB) · **I** = API/database integration
(Vitest + Supertest against `coursepm_test`) · **C** = UI component (React Testing Library) ·
**E** = end-to-end (Playwright in Edge, seeded DB) · **B** = build/configuration check. Fixtures: seed users Supervisor 1 (Alpha), Supervisor 2
(Beta, Gamma), students A1/A2 (Alpha), B1/B2 (Beta). Milestones with a past deadline are inserted directly
through Prisma in test setup, because the API can't create them.

The **Actual test (file › name)** and **Result** columns remain blank until the release run for Part F.

| Test | AC | Lvl | Precondition / input | Action | Expected result | Actual test (file › name) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TEST-01-01 | AC-01-1 | I | Seeded A1 | POST login with correct password | 200; body.user.role = STUDENT; `Set-Cookie` cpm_session HttpOnly | | |
| TEST-01-02 | AC-01-2 | I | Seeded A1 | Login with wrong password | 401 INVALID_CREDENTIALS; no Set-Cookie | | |
| TEST-01-03 | AC-01-2 | I | — | Login with unknown e-mail; then with an empty body | 401 with the same message as TEST-01-02; empty body → 400 | | |
| TEST-01-04 | AC-01-3 | I | Logged-in agent | GET /api/auth/me | 200 `{ user: { id, name, email, role } }` | | |
| TEST-01-05 | AC-01-4 | I | Logged-in agent; cookie saved | POST logout, then GET /auth/me with the saved cookie | 204; then 401; Session row count for user = 0 | | |
| TEST-01-06 | AC-01-5 | U | — | hashPassword("x…"), verifyPassword right/wrong | Format `scrypt$16384$8$1$…`; true / false | | |
| TEST-01-07 | AC-01-5 | I | — | Login + /me responses | JSON contains no `password` / `passwordHash` key | | |
| TEST-01-08 | AC-01-6 | I | A1 | Login body includes `"role":"SUPERVISOR"` | Returned role = STUDENT | | |
| TEST-01-09 | AC-01-7 | I | Session with expiresAt set to the past | GET /auth/me | 401; the session row is deleted | | |
| TEST-01-10 | AC-01-8 | I | Inactive seeded user; separately, an active user's session before deactivation | Attempt login; mark the second user inactive, then GET /api/auth/me with the saved cookie | Login → 401 INVALID_CREDENTIALS with the generic message; saved cookie → 401 UNAUTHENTICATED | | |
| TEST-01-11 | AC-01-9 | I | No session cookie | POST /api/auth/logout | 204 with no body | | |
| TEST-01-12 | AC-01-5 | I | A1 created in `DATABASE_URL_TEST` by the shared account helper; known local password | Read A1's `passwordHash` directly from the test DB | Stored value starts `scrypt$16384$8$1$`, differs from plaintext, and verifies against the password | | |
| TEST-01-13 | AC-01-11 | I | Seeded A1; `SESSION_TTL_HOURS=8`; fixed server clock | POST login, parse the cookie token, then read its `Session` row from the test DB | Cookie has `HttpOnly`, `SameSite=Lax`, `Path=/`; row ID equals SHA-256(cookie token), not the raw token; `expiresAt - createdAt` = 8 h. With `NODE_ENV=production`, cookie also has `Secure` | | |
| TEST-UI-05 | AC-01-10 | C | Login form; missing field, then mocked 401 INVALID_CREDENTIALS | Submit each case | Missing field shows a field-level message with entered values kept; invalid credentials show one generic alert | | |
| TEST-02-01 | AC-02-1 | I | No cookie | GET/POST each protected route group | 401 UNAUTHENTICATED for all; body has only `error` | | |
| TEST-02-02 | AC-02-2 | I | A1; Beta milestone with 1 submission | GET Beta milestone, GET its submissions | 404 both; body doesn't contain the Beta title | | |
| TEST-02-03 | AC-02-3 | I | Supervisor 2; Alpha milestone | GET Alpha team / milestone / submissions | 404 for all | | |
| TEST-02-04 | AC-02-4 | I | A1 | POST /teams/{alpha}/milestones with valid body | 403 FORBIDDEN; milestone count unchanged | | |
| TEST-02-05 | AC-02-5 | I | A1; Alpha submission | POST feedback | 403; feedback count unchanged | | |
| TEST-02-06 | AC-02-6 | I | A small probe app in the test reuses the exported `errorHandler` and has a handler that throws | Request the probe app's throwing path | 500 INTERNAL_ERROR with no stack, SQL or Prisma text in the response | | |
| TEST-UI-03 | AC-02-7 | C | Authenticated page; mocked protected API response = 401 | Render page and complete the request | Navigate to `/login`; private content is not shown | | |
| TEST-02-07 | AC-02-8 | I | Unknown `/api/*` path | GET the path | 404 NOT_FOUND with the standard error shape and no stack or SQL | | |
| TEST-02-08 | AC-02-8 | I | No session; malformed JSON body and a JSON body over 100 kB | POST each body to `/api/auth/login` | Malformed JSON → 400 VALIDATION_ERROR; oversized body → 413 PAYLOAD_TOO_LARGE; both use the standard error shape without stack or SQL | | |
| TEST-02-09 | AC-02-9 | I | A1; Alpha and Beta team IDs | POST a valid milestone body to each team's endpoint | Alpha → 403; Beta → 404; neither creates a milestone | | |
| TEST-UI-04 | AC-02-10 | C | Team, milestone and submission list components with pending, empty and failed API responses | Render each state and activate **Retry** | Each list shows the corresponding loading, empty or error state; Retry reissues the request | | |
| TEST-03-01 | AC-03-1 | I | A1, Supervisor 2 | GET /teams | A1 → [Alpha] with 2 members; Supervisor 2 → [Beta, Gamma] | | |
| TEST-03-02 | AC-03-2 | I | A1 | GET /teams/{beta} | 404 | | |
| TEST-03-03 | AC-03-3 | I | Supervisor 1 | GET /teams/{beta} | 404 | | |
| TEST-03-04 | AC-03-4 | I | Demo seed has run once in the test database | Run the same seed again; compare row identities and counts | Same users, teams, memberships and supervisor assignments; no duplicates | | |
| TEST-04-01 | AC-04-1 | I | Supervisor 1 | POST Alpha milestone (deadline +7 d) | 201; GET list as A1 includes it | | |
| TEST-04-02 | AC-04-2 | I | A1; Alpha team | POST a valid milestone body to Alpha (may share implementation with TEST-02-04) | 403 FORBIDDEN; milestone count unchanged | | |
| TEST-04-03 | AC-04-3 | I | Supervisor 1 | POST /teams/{beta}/milestones | 404; count unchanged | | |
| TEST-04-04 | AC-04-4 | U | now fixed | validateMilestone: title length 2 / 3 / 120 / 121; past deadline; maxRevisions 0 / 1 / 5 / 6 | Errors exactly for 2, 121, past, 0, 6 | | |
| TEST-04-05 | AC-04-4 | I | Supervisor 1 | POST with title "ab" and a past deadline | 400; `fields.title` and `fields.deadline` present | | |
| TEST-04-06 | AC-04-5 | I | 3 milestones with mixed deadlines | GET list | Ascending by deadline; revisionsUsed + status correct | | |
| TEST-UI-01 | AC-04-6 | C | Mock API returns 400 with `fields.title` | Submit the form | Error text under Title; input value kept | | |
| TEST-05-01 | AC-05-1 | I | A1; open milestone | POST submission | 201 revision 1; submittedBy A1; GET returns it | | |
| TEST-05-02 | AC-05-2 | I | Revision 1 exists | A2 POSTs again | revision 2; revision 1 fields unchanged | | |
| TEST-05-03 | AC-05-3 | U | deadline D and revisionsUsed = 0 | checkCanSubmit with now = D−1 ms, D, D+1 ms | `{ ok: true, nextRevision: 1 }`, `{ ok: true, nextRevision: 1 }`, then DEADLINE_PASSED | | |
| TEST-05-04 | AC-05-3 | I | Milestone with deadline in the past (inserted directly) | A1 POSTs | 409 DEADLINE_PASSED; count unchanged | | |
| TEST-05-05 | AC-05-4 | U | maxRevisions 2 and an open deadline | checkCanSubmit with revisionsUsed 0, 1, 2 | `{ ok: true, nextRevision: 1 }`, `{ ok: true, nextRevision: 2 }`, then REVISION_LIMIT_REACHED | | |
| TEST-05-06 | AC-05-4 | I | maxRevisions 2; 2 stored | A1 POSTs | 409 REVISION_LIMIT_REACHED; count = 2 | | |
| TEST-05-07 | AC-05-5 | U + I | — | validateSubmission with ftp:, javascript:, "not a url", a 2,049-char link, a 2-char title; the same via API | Each rejected; API 400 with `fields.link` / `fields.title` | | |
| TEST-05-08 | AC-05-6 | I | Open milestone, limit 3 | Two POSTs with Promise.all | Two rows with revisions {1, 2}; no duplicate | | |
| TEST-05-09 | AC-05-7 | I | Revisions 1 and 2, feedback on 1 (feedback part with #8) | GET list | [rev 2 (feedback null), rev 1 (feedback present)] | | |
| TEST-05-10 | AC-05-9 | I | Open milestone, limit 1 | Two POSTs with Promise.all | Exactly one 201 revision 1 and one 409 REVISION_LIMIT_REACHED; one row stored | | |
| TEST-UI-02 | AC-05-8 | C | Milestone props: deadline passed / limit reached; separately, mocked submission response = 409 | Render detail; submit while the UI appears open | Form absent for closed/used-up states; a 409 response displays its message | | |
| TEST-UI-07 | AC-05-10 | C | Submission form; mocked 400 with `fields.link` | Submit an invalid link | Error appears beside Link and entered values remain | | |
| TEST-06-01 | AC-06-1 | I | Supervisor 1; Alpha rev 1 | POST feedback | 201; row submissionId = rev 1 | | |
| TEST-06-02 | AC-06-2 | I | A1; Alpha submission | POST feedback to the submission (may share implementation with TEST-02-05) | 403 FORBIDDEN; feedback count unchanged | | |
| TEST-06-03 | AC-06-3 | I | Supervisor 2; Alpha rev 1 | POST feedback | 404; count unchanged | | |
| TEST-06-04 | AC-06-4 | I | Feedback on rev 1; then rev 2 submitted | A1 GET list | Feedback still on rev 1; rev 2 feedback null | | |
| TEST-06-05 | AC-06-5 | I | Rev 1 already has feedback | POST feedback again | 409 FEEDBACK_EXISTS | | |
| TEST-06-06 | AC-06-5 | I | Supervisor 1 | POST body "" and a 4,001-char body | 400 for both | | |
| TEST-UI-06 | AC-06-6 | C | Feedback form; mocked 400 with `fields.body` | Submit invalid feedback | Error appears beside the textarea and entered text remains | | |
| E2E-01 | AC-01-1, AC-01-3, AC-01-4, AC-03-1 | E | Seeded DB | A1 logs in → sees Team Alpha → logs out → /teams redirects to /login | As described | | |
| E2E-02 | AC-04-1, AC-05-1, AC-05-7, AC-06-1, AC-06-4 | E | Seeded DB | Supervisor 1 creates a milestone → A1 submits → sees revision 1 → Supervisor 1 gives feedback → A1 sees the feedback | Each step visible in the UI and still there after a reload | | |
| E2E-03 | AC-03-5, AC-04-7 | E | Seeded DB; Edge browser; A1 signed in | View Alpha's team page, then navigate to Beta's team URL | Alpha page has no **New milestone** control; Beta page shows **Team not found** and no Beta data | | |

## Scaffold verification (Issue #3; R-01 and R-02)

These checks belong to the scaffold PR and run before feature implementation. Their stable AC are in
[R-01-R-02-scaffold.md](R-01-R-02-scaffold.md). Re-run them on the Sprint 1 release and record the actual
test file/name, build command and result above or in the Part F results table.

| Test | AC | Lvl | Precondition / input | Action | Expected result | Actual test (file › name) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TEST-R01-01 | AC-R01-1 | I | Server started with test configuration; no cookie | GET `/api/health` | 200 `{ "status": "ok", "service": "CoursePM API" }`; no authentication required | | |
| TEST-R01-02 | AC-R01-2 | I | `DATABASE_URL` and `DATABASE_URL_TEST` point to different PostgreSQL databases; no domain tables exist yet | Connect through the test configuration and run `SELECT current_database()`; separately start setup with a missing test URL and with the development URL reused | Connection selects the test database; both invalid configurations fail before migration, seed or cleanup. No domain write is required in the scaffold PR | | |
| TEST-R01-03 | AC-R01-3 | I | Server running | GET an unknown `/api/*` path | 404 `{ error: { code: "NOT_FOUND", message: "Not found." } }`, with no stack/SQL text (may share implementation with TEST-02-07) | | |
| TEST-R02-01 | AC-R02-1 | B + C | Client installed; health request pending, then mocked healthy or unavailable | Run `npm run build`; render the app and resolve/reject its health request | Build exits 0; app shows `API status: checking…`, then `API status: connected` on 200 with the expected health body or `API status: unreachable` on failure/unhealthy response | | |

**Manual checks (they supplement the automated tests; they don't replace them):** MAN-01 restart the API and
confirm the data is still there (NFR-06); MAN-02 inspect the cookie flags in DevTools (NFR-04).

**Delivered in parts (the routes and tables arrive with later Issues).** #5 delivers the team-route parts of
TEST-02-01 and TEST-02-03 and the team-list part of TEST-UI-04. The milestone parts of TEST-02-01, TEST-02-02,
TEST-02-03, TEST-UI-04 and TEST-02-04 / TEST-02-09 arrive with #6 (F-04); the submission parts of TEST-02-01,
TEST-02-02, TEST-02-03 and TEST-UI-04 with #7 (F-05); TEST-02-05 and the feedback part of TEST-05-09 (#7 checks
the newest-first order and a `feedback: null` slot) with #8 (F-06).

**Additional automated cases.** Existing tests may strengthen an AC without receiving a separate STS ID.
Retain and report these cases with their actual test file/name in Part F: e-mail normalization (AC-01-1),
inactive login (AC-01-8), the `maxRevisions` CHECK constraint (AC-04-4), and the composite-FK integrity
check for submission/team ownership (AC-05-1), a malformed session cookie treated as no session (AC-02-1),
`/api/auth/me` without a cookie (AC-01-3), and the login UI cases in `auth-ui.test.tsx`: a visitor without a
session is sent to `/login` (AC-01-1), a successful login opens `/teams` with name and role (AC-01-1), wrong
credentials show the server message (AC-01-2) and Log out returns to the login page (AC-01-4), team member
objects expose only `id` and `name` (AC-03-1), a member can open their own team (AC-03-1), a non-existent or
non-numeric team id answers 404 like an out-of-scope one (AC-03-2), and the team detail page shows name,
course and members (AC-03-1). F-05 adds: a supervisor of the team cannot submit (403 after the scope check, AC-05-1), milestones report
`revisionsUsed` and `latestSubmittedAt` from stored revisions (AC-05-7), milestone titles link to their page,
a student submit updates the list and counter, the revision list is newest first with submitter and link
(AC-05-1, AC-05-7, UI), and an out-of-scope milestone page shows **Milestone not found** (AC-02-2). The submission routes check scope (404), role (403), fields (400) and rules (409) in that order, and a
non-numeric milestone id is 404. Not covered by an automated test (would need fault injection into the
database layer): exhausting all 3 retry attempts (409 `CONFLICT`) and a deadline that passes during a
retry; the inclusive deadline (`now == deadline`) is covered at unit level only (TEST-05-03). These
supplement the planned STS rows above.
