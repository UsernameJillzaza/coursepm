# Sprint 1 — Software Test Specification (STS)

Version 1.1 · 2026-11-28 (CHG-01: TEST-05-02, 05-05, 05-06, 05-08, 05-09, TEST-UI-02 and E2E-02 revised; TEST-05-11 … 05-13 added; see the CHG-01 section) · 1.0 · 2026-11-15. Levels: **U** = unit (Vitest, no DB) · **I** = API/database integration
(Vitest + Supertest against `coursepm_test`) · **C** = UI component (React Testing Library) ·
**E** = end-to-end (Playwright in Edge, seeded DB) · **B** = build/configuration check. Fixtures: seed users Supervisor 1 (Alpha), Supervisor 2
(Beta, Gamma), students A1/A2 (Alpha), B1/B2 (Beta). Milestones with a past deadline are inserted directly
through Prisma in test setup, because the API can't create them.

The **Actual test (file › name)** and **Result** columns come from the release-candidate run on `daefdff` ([artifacts/sprint-1/test-runs/sprint1-release-run.txt](../../../artifacts/sprint-1/test-runs/sprint1-release-run.txt)). "Pass (n/n)" counts the test cases that carry the ID; a case can carry more than one ID. Commands: `npm --prefix server test`, `npm --prefix client test`, `npx tsc --noEmit` (server), `npm --prefix client run build`, `npx playwright test`. Counts: server 112/112 passed, 0 failed, 0 skipped · client 39/39 passed, 0 failed, 0 skipped · E2E 3/3 passed, 0 failed, 0 skipped · type-check OK · client build OK.

| Test | AC | Lvl | Precondition / input | Action | Expected result | Actual test (file › name) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TEST-01-01 | AC-01-1 | I | Seeded A1 | POST login with correct password | 200; body.user.role = STUDENT; `Set-Cookie` cpm_session HttpOnly | `auth.api.test.ts` › TEST-01-01 (AC-01-1): valid credentials → 200, public user, HttpOnly cpm_session cookie | Pass (1/1) |
| TEST-01-02 | AC-01-2 | I | Seeded A1 | Login with wrong password | 401 INVALID_CREDENTIALS; no Set-Cookie | `auth.api.test.ts` › TEST-01-02 (AC-01-2): wrong password → 401 INVALID_CREDENTIALS, no cookie | Pass (1/1) |
| TEST-01-03 | AC-01-2 | I | — | Login with unknown e-mail; then with an empty body | 401 with the same message as TEST-01-02; empty body → 400 | `auth.api.test.ts` › TEST-01-03 (AC-01-2): unknown e-mail → the same 401 body; empty body → 400 naming both fields | Pass (1/1) |
| TEST-01-04 | AC-01-3 | I | Logged-in agent | GET /api/auth/me | 200 `{ user: { id, name, email, role } }` | `auth.api.test.ts` › TEST-01-04 (AC-01-3): returns { user } for a valid session | Pass (1/1) |
| TEST-01-05 | AC-01-4 | I | Logged-in agent; cookie saved | POST logout, then GET /auth/me with the saved cookie | 204; then 401; Session row count for user = 0 | `auth.api.test.ts` › TEST-01-05 (AC-01-4): logout deletes the session; the old cookie is then rejected | Pass (1/1) |
| TEST-01-06 | AC-01-5 | U | — | hashPassword("x…"), verifyPassword right/wrong | Format `scrypt$16384$8$1$…`; true / false | `password.unit.test.ts` › stores scrypt$N$r$p$salt$key, never the password itself<br/>`password.unit.test.ts` › uses a fresh salt, so the same password gives different hashes<br/>(+1 more) | Pass (3/3) |
| TEST-01-07 | AC-01-5 | I | — | Login + /me responses | JSON contains no `password` / `passwordHash` key | `auth.api.test.ts` › TEST-01-07: login and /me bodies contain no password or hash<br/>`auth.api.test.ts` › TEST-01-12: A1's stored passwordHash is a scrypt hash that verifies, never the plaintext | Pass (2/2) |
| TEST-01-08 | AC-01-6 | I | A1 | Login body includes `"role":"SUPERVISOR"` | Returned role = STUDENT | `auth.api.test.ts` › TEST-01-08 (AC-01-6): a "role" sent by the client is ignored | Pass (1/1) |
| TEST-01-09 | AC-01-7 | I | Session with expiresAt set to the past | GET /auth/me | 401; the session row is deleted | `auth.api.test.ts` › TEST-01-09 (AC-01-7): an expired session → 401 and the row is deleted | Pass (1/1) |
| TEST-01-10 | AC-01-8 | I | Inactive seeded user; separately, an active user's session before deactivation | Attempt login; mark the second user inactive, then GET /api/auth/me with the saved cookie | Login → 401 INVALID_CREDENTIALS with the generic message; saved cookie → 401 UNAUTHENTICATED | `auth.api.test.ts` › an inactive account cannot log in: the same generic 401 INVALID_CREDENTIALS<br/>`auth.api.test.ts` › a session saved before deactivation gets 401 UNAUTHENTICATED on its next request | Pass (2/2) |
| TEST-01-11 | AC-01-9 | I | No session cookie | POST /api/auth/logout | 204 with no body | `auth.api.test.ts` › TEST-01-11 (AC-01-9): logout without a session → 204 with no body | Pass (1/1) |
| TEST-01-12 | AC-01-5 | I | A1 created in `DATABASE_URL_TEST` by the shared account helper; known local password | Read A1's `passwordHash` directly from the test DB | Stored value starts `scrypt$16384$8$1$`, differs from plaintext, and verifies against the password | `auth.api.test.ts` › TEST-01-07: login and /me bodies contain no password or hash<br/>`auth.api.test.ts` › TEST-01-12: A1's stored passwordHash is a scrypt hash that verifies, never the plaintext | Pass (2/2) |
| TEST-01-13 | AC-01-11 | I | Seeded A1; `SESSION_TTL_HOURS=8`; fixed server clock | POST login, parse the cookie token, then read its `Session` row from the test DB | Cookie has `HttpOnly`, `SameSite=Lax`, `Path=/`; row ID equals SHA-256(cookie token), not the raw token; `expiresAt - createdAt` = 8 h. With `NODE_ENV=production`, cookie also has `Secure` | `auth.api.test.ts` › stores SHA-256(token), not the token; expires 8 h after creation; cookie HttpOnly, SameSite=Lax, Pat<br/>`auth.api.test.ts` › adds Secure to the cookie when NODE_ENV=production | Pass (2/2) |
| TEST-UI-05 | AC-01-10 | C | Login form; missing field, then mocked 401 INVALID_CREDENTIALS | Submit each case | Missing field shows a field-level message with entered values kept; invalid credentials show one generic alert | `auth-ui.test.tsx` › a missing field shows a message beside that field and keeps what was typed<br/>`auth-ui.test.tsx` › invalid credentials show one generic alert, mark no field, and keep the typed values | Pass (2/2) |
| TEST-02-01 | AC-02-1 | I | No cookie | GET/POST each protected route group | 401 UNAUTHENTICATED for all; body has only `error` | `submissions.api.test.ts` › TEST-02-01 submission part (AC-02-1): submission routes need a session<br/>`feedback.api.test.ts` › TEST-02-01 feedback part (AC-02-1): requires a session; missing and malformed submission IDs return <br/>(+4 more) | Pass (6/6) |
| TEST-02-02 | AC-02-2 | I | A1; Beta milestone with 1 submission | GET Beta milestone, GET its submissions | 404 both; body doesn't contain the Beta title | `submissions.api.test.ts` › TEST-02-02 / TEST-02-03 submission part (AC-02-2, AC-02-3): outsiders get 404 with no submission dat<br/>`milestones.api.test.ts` › TEST-02-01 / TEST-02-02 milestone part (AC-02-1, AC-02-2): new routes require a session and out-of-s | Pass (2/2) |
| TEST-02-03 | AC-02-3 | I | Supervisor 2; Alpha milestone | GET Alpha team / milestone / submissions | 404 for all | `submissions.api.test.ts` › TEST-02-02 / TEST-02-03 submission part (AC-02-2, AC-02-3): outsiders get 404 with no submission dat<br/>`milestones.api.test.ts` › TEST-02-03 milestone part (AC-02-3): a supervisor of another team gets 404 for an Alpha milestone an<br/>(+1 more) | Pass (3/3) |
| TEST-02-04 | AC-02-4 | I | A1 | POST /teams/{alpha}/milestones with valid body | 403 FORBIDDEN; milestone count unchanged | `milestones.api.test.ts` › TEST-04-02 / TEST-02-04 (AC-04-2, AC-02-4): a student cannot create in their own team | Pass (1/1) |
| TEST-02-05 | AC-02-5 | I | A1; Alpha submission | POST feedback | 403; feedback count unchanged | `feedback.api.test.ts` › TEST-06-02 / TEST-02-05 (AC-06-2, AC-02-5): a student in scope gets 403 before validation and stores | Pass (1/1) |
| TEST-02-06 | AC-02-6 | I | A small probe app in the test reuses the exported `errorHandler` and has a handler that throws | Request the probe app's throwing path | 500 INTERNAL_ERROR with no stack, SQL or Prisma text in the response | `errors-and-seed.test.ts` › a thrown internal error becomes 500 INTERNAL_ERROR with no stack or SQL text | Pass (1/1) |
| TEST-UI-03 | AC-02-7 | C | Authenticated page; mocked protected API response = 401 | Render page and complete the request | Navigate to `/login`; private content is not shown | `auth-ui.test.tsx` › TEST-UI-03 (AC-02-7): a 401 from any API call mid-session sends the user to the login page | Pass (1/1) |
| TEST-02-07 | AC-02-8 | I | Unknown `/api/*` path | GET the path | 404 NOT_FOUND with the standard error shape and no stack or SQL | `health.api.test.ts` › TEST-R01-03 / TEST-02-07 (AC-R01-3, AC-02-8): an unknown /api route → 404 NOT_FOUND "Not found." wit | Pass (1/1) |
| TEST-02-08 | AC-02-8 | I | No session; malformed JSON body and a JSON body over 100 kB | POST each body to `/api/auth/login` | Malformed JSON → 400 VALIDATION_ERROR; oversized body → 413 PAYLOAD_TOO_LARGE; both use the standard error shape without stack or SQL | `errors-and-seed.test.ts` › a body over the 100 kB limit → 413 PAYLOAD_TOO_LARGE in the standard shape<br/>`errors-and-seed.test.ts` › malformed JSON → 400 VALIDATION_ERROR | Pass (2/2) |
| TEST-02-09 | AC-02-9 | I | A1; Alpha and Beta team IDs | POST a valid milestone body to each team's endpoint | Alpha → 403; Beta → 404; neither creates a milestone | `milestones.api.test.ts` › TEST-04-03 / TEST-02-09 (AC-04-3, AC-02-9): scope precedes role and validation | Pass (1/1) |
| TEST-UI-04 | AC-02-10 | C | Team, milestone and submission list components with pending, empty and failed API responses | Render each state and activate **Retry** | Each list shows the corresponding loading, empty or error state; Retry reissues the request | `teams-ui.test.tsx` › TEST-UI-04 team part (AC-02-10): shows a loading state while the list is pending<br/>`teams-ui.test.tsx` › TEST-UI-04 team part (AC-02-10): shows the empty state when the user is in no team<br/>(+8 more) | Pass (10/10) |
| TEST-03-01 | AC-03-1 | I | A1, Supervisor 2 | GET /teams | A1 → [Alpha] with 2 members; Supervisor 2 → [Beta, Gamma] | `teams.api.test.ts` › TEST-03-01 (AC-03-1): a student sees only their own team, with its members and supervisors<br/>`teams.api.test.ts` › TEST-03-01 (AC-03-1): a supervisor sees exactly their assigned teams | Pass (2/2) |
| TEST-03-02 | AC-03-2 | I | A1 | GET /teams/{beta} | 404 | `teams.api.test.ts` › TEST-03-02 (AC-03-2): a student requesting another team gets 404 with no team data | Pass (1/1) |
| TEST-03-03 | AC-03-3 | I | Supervisor 1 | GET /teams/{beta} | 404 | `teams.api.test.ts` › TEST-03-03 / TEST-02-03 team part (AC-03-3, AC-02-3): an unassigned supervisor gets 404 | Pass (1/1) |
| TEST-03-04 | AC-03-4 | I | Demo seed has run once in the test database | Run the same seed again; compare row identities and counts | Same users, teams, memberships and supervisor assignments; no duplicates | `errors-and-seed.test.ts` › running the seed twice keeps the same users, teams, memberships and assignments (same rows, no dupli | Pass (1/1) |
| TEST-04-01 | AC-04-1 | I | Supervisor 1 | POST Alpha milestone (deadline +7 d) | 201; GET list as A1 includes it | `milestones.api.test.ts` › TEST-04-01 (AC-04-1): an assigned supervisor creates a milestone visible to their students | Pass (1/1) |
| TEST-04-02 | AC-04-2 | I | A1; Alpha team | POST a valid milestone body to Alpha (may share implementation with TEST-02-04) | 403 FORBIDDEN; milestone count unchanged | `milestones.api.test.ts` › TEST-04-02 / TEST-02-04 (AC-04-2, AC-02-4): a student cannot create in their own team | Pass (1/1) |
| TEST-04-03 | AC-04-3 | I | Supervisor 1 | POST /teams/{beta}/milestones | 404; count unchanged | `milestones.api.test.ts` › TEST-04-03 / TEST-02-09 (AC-04-3, AC-02-9): scope precedes role and validation | Pass (1/1) |
| TEST-04-04 | AC-04-4 | U | now fixed | validateMilestone: title length 2 / 3 / 120 / 121; past deadline; maxRevisions 0 / 1 / 5 / 6 | Errors exactly for 2, 121, past, 0, 6 | `milestone-rules.unit.test.ts` › checks the trimmed title length for ab<br/>`milestone-rules.unit.test.ts` › checks the trimmed title length for abc<br/>(+10 more) | Pass (12/12) |
| TEST-04-05 | AC-04-4 | I | Supervisor 1 | POST with title "ab" and a past deadline | 400; `fields.title` and `fields.deadline` present | `milestones.api.test.ts` › TEST-04-05 (AC-04-4): invalid fields are combined, and boundary values are accepted | Pass (1/1) |
| TEST-04-06 | AC-04-5 | I | 3 milestones with mixed deadlines | GET list | Ascending by deadline; revisionsUsed + status correct | `milestones.api.test.ts` › TEST-04-06 (AC-04-5): lists milestones by deadline with derived status and empty revision fields | Pass (1/1) |
| TEST-UI-01 | AC-04-6 | C | Mock API returns 400 with `fields.title` | Submit the form | Error text under Title; input value kept | `milestones-ui.test.tsx` › TEST-UI-01 (AC-04-6): server field errors appear under inputs without clearing typed values | Pass (1/1) |
| TEST-05-01 | AC-05-1 | I | A1; open milestone | POST submission | 201 revision 1; submittedBy A1; GET returns it | `submissions.api.test.ts` › TEST-05-01 (AC-05-1): a team student submits → 201 revision 1 in the contract shape; a fresh GET ret | Pass (1/1) |
| TEST-05-02 | AC-05-2 | I | Revision 1 exists **and Supervisor 1 has recorded feedback on it** (CHG-01) | A2 POSTs again | revision 2; revision 1 fields unchanged | `submissions.api.test.ts` › TEST-05-02 (AC-05-2) | Revised by CHG-01: not run yet |
| TEST-05-03 | AC-05-3 | U | deadline D and revisionsUsed = 0 | checkCanSubmit with now = D−1 ms, D, D+1 ms | `{ ok: true, nextRevision: 1 }`, `{ ok: true, nextRevision: 1 }`, then DEADLINE_PASSED | `submission-rules.unit.test.ts` › accepts 1 ms before the deadline<br/>`submission-rules.unit.test.ts` › accepts exactly at the deadline (the deadline is inclusive)<br/>(+1 more) | Pass (3/3) |
| TEST-05-04 | AC-05-3 | I | Milestone with deadline in the past (inserted directly) | A1 POSTs | 409 DEADLINE_PASSED; count unchanged | `submissions.api.test.ts` › TEST-05-04 (AC-05-3): after the deadline → 409 DEADLINE_PASSED and nothing is stored | Pass (1/1) |
| TEST-05-05 | AC-05-4 | U | maxRevisions 2, an open deadline, `latestHasFeedback: true` (CHG-01 isolates the limit rule) | checkCanSubmit with revisionsUsed 0, 1, 2 | `{ ok: true, nextRevision: 1 }`, `{ ok: true, nextRevision: 2 }`, then REVISION_LIMIT_REACHED | `submission-rules.unit.test.ts` › TEST-05-05 cases | Revised by CHG-01: not run yet |
| TEST-05-06 | AC-05-4, AC-05-12 | I | maxRevisions 2; revision 1 with feedback; revision 2 **without** feedback | A1 POSTs a third time | 409 REVISION_LIMIT_REACHED (the limit is checked before the feedback rule); count = 2 | `submissions.api.test.ts` › TEST-05-06 (AC-05-4) | Revised by CHG-01: not run yet |
| TEST-05-07 | AC-05-5 | U + I | — | validateSubmission with ftp:, javascript:, "not a url", a 2,049-char link, a 2-char title; the same via API | Each rejected; API 400 with `fields.link` / `fields.title` | `submissions.api.test.ts` › TEST-05-07 (AC-05-5): an invalid link or title → 400 naming the field; nothing stored<br/>`submission-rules.unit.test.ts` › accepts a valid submission and trims it<br/>(+8 more) | Pass (10/10) |
| TEST-05-08 | AC-05-6 | I | Open milestone, limit 3: (a) no revisions; (b) revision 1 with feedback | Two POSTs with Promise.all in each state | (a) one 201 revision 1 and one 409 AWAITING_FEEDBACK; (b) one 201 revision 2 and one 409 AWAITING_FEEDBACK; never a duplicate revision | `submissions.api.test.ts` › TEST-05-08 (AC-05-6) | Revised by CHG-01: not run yet |
| TEST-05-09 | AC-05-7 | I | Revision 1 with feedback, then revision 2 | GET list | [rev 2 (feedback null), rev 1 (feedback present)] | `submissions.api.test.ts` › TEST-05-09 (AC-05-7)<br/>`feedback.api.test.ts` › TEST-06-04 / TEST-05-09 (unchanged) | Revised by CHG-01: not run yet |
| TEST-05-10 | AC-05-9 | I | Open milestone, limit 1 | Two POSTs with Promise.all | Exactly one 201 revision 1 and one 409 REVISION_LIMIT_REACHED; one row stored | `submissions.api.test.ts` › TEST-05-10 (AC-05-9): limit 1, two at once → exactly one 201 revision 1 and one 409 REVISION_LIMIT_R | Pass (1/1) |
| TEST-05-11 | AC-05-11, AC-05-12 | U | Open deadline, maxRevisions 3 | checkCanSubmit with (revisionsUsed 0, no feedback), (1, no feedback), (1, feedback), (2, no feedback); deadline passed + (1, no feedback); limit 1 + (1, no feedback) | ok rev 1; AWAITING_FEEDBACK; ok rev 2; AWAITING_FEEDBACK; DEADLINE_PASSED; REVISION_LIMIT_REACHED | `submission-rules.unit.test.ts` › TEST-05-11 cases | New (CHG-01): not run yet |
| TEST-05-12 | AC-05-11, AC-05-13 | I | Open milestone, limit 3; revision 1 by A1 | A2 POSTs; Supervisor 1 records feedback on revision 1; A2 POSTs; A1 POSTs again | 409 AWAITING_FEEDBACK with count 1 and detail `awaitingFeedback: true`; then 201 revision 2 and `awaitingFeedback` false→true; third POST 409 AWAITING_FEEDBACK (feedback on rev 1 does not unlock rev 3) | `submissions.api.test.ts` › TEST-05-12 (AC-05-11) | New (CHG-01): not run yet |
| TEST-05-13 | AC-05-12 | I | Revision 1 without feedback; (a) deadline passed (milestone inserted directly), (b) invalid link | A1 POSTs | (a) 409 DEADLINE_PASSED; (b) 400 VALIDATION_ERROR; count unchanged | `submissions.api.test.ts` › TEST-05-13 (AC-05-12) | New (CHG-01): not run yet |
| TEST-UI-02 | AC-05-8, AC-05-13 | C | Milestone props: deadline passed / limit reached / *(CHG-01)* `awaitingFeedback: true` with revisionsUsed 1; separately, mocked submission response = 409 | Render detail; submit while the UI appears open | Form absent for closed, used-up and waiting states ("Waiting for feedback on revision 1."); a 409 response displays its message | `submissions-ui.test.tsx` › TEST-UI-02 cases | Revised by CHG-01: not run yet |
| TEST-UI-07 | AC-05-10 | C | Submission form; mocked 400 with `fields.link` | Submit an invalid link | Error appears beside Link and entered values remain | `submissions-ui.test.tsx` › TEST-UI-07 (AC-05-10): a 400 shows the message beside Link and keeps the entered values | Pass (1/1) |
| TEST-06-01 | AC-06-1 | I | Supervisor 1; Alpha rev 1 | POST feedback | 201; row submissionId = rev 1 | `feedback.api.test.ts` › TEST-06-01 (AC-06-1): an assigned supervisor records trimmed feedback on revision 1 | Pass (1/1) |
| TEST-06-02 | AC-06-2 | I | A1; Alpha submission | POST feedback to the submission (may share implementation with TEST-02-05) | 403 FORBIDDEN; feedback count unchanged | `feedback.api.test.ts` › TEST-06-02 / TEST-02-05 (AC-06-2, AC-02-5): a student in scope gets 403 before validation and stores | Pass (1/1) |
| TEST-06-03 | AC-06-3 | I | Supervisor 2; Alpha rev 1 | POST feedback | 404; count unchanged | `feedback.api.test.ts` › TEST-06-03 (AC-06-3): an unassigned supervisor or student gets 404 before role or validation | Pass (1/1) |
| TEST-06-04 | AC-06-4 | I | Feedback on rev 1; then rev 2 submitted | A1 GET list | Feedback still on rev 1; rev 2 feedback null | `feedback.api.test.ts` › TEST-06-04 / TEST-05-09 (AC-06-4, AC-05-7): feedback stays with revision 1 after revision 2 | Pass (1/1) |
| TEST-06-05 | AC-06-5 | I | Rev 1 already has feedback | POST feedback again | 409 FEEDBACK_EXISTS | `feedback.api.test.ts` › TEST-06-05 (AC-06-5): a second POST returns 409 and leaves the original feedback unchanged | Pass (1/1) |
| TEST-06-06 | AC-06-5 | I | Supervisor 1 | POST body "" and a 4,001-char body | 400 for both | `feedback.api.test.ts` › TEST-06-06 (AC-06-5): empty, whitespace-only and 4,001-character bodies get 400; 4,000 is accepted | Pass (1/1) |
| TEST-UI-06 | AC-06-6 | C | Feedback form; mocked 400 with `fields.body` | Submit invalid feedback | Error appears beside the textarea and entered text remains | `feedback-ui.test.tsx` › TEST-UI-06 (AC-06-6): a 400 field error stays beside the textarea and preserves the text | Pass (1/1) |
| E2E-01 | AC-01-1, AC-01-2, AC-01-3, AC-01-4, AC-03-1 | E | Seeded DB (`db:seed`); Edge; `SEED_PASSWORD` in `server/.env` | A1 logs in with a wrong password → logs in correctly → sees Team Alpha only → reloads → logs out → opens /teams | One generic alert; then My teams with Team Alpha only; the session survives the reload; after logout /teams redirects to /login (screenshots 01–03) | `e2e-01-login-teams.spec.ts` › E2E-01: wrong password, login, own team only, reload keeps the session, logout | Pass (1/1) |
| E2E-02 | AC-04-1, AC-05-1, AC-05-2, AC-05-7, AC-05-11, AC-06-1, AC-06-4; evidence for AC-04-4, AC-05-4, AC-05-5, AC-05-8, AC-05-10, AC-05-13 | E | Seeded DB (`db:seed`); Edge; a new milestone title per run | Supervisor 1 tries a past deadline, then creates a milestone (limit 2) → A1 tries a `javascript:` link, then submits revision 1 → *(CHG-01)* A1 sees "Waiting for feedback on revision 1." → Supervisor 1 saves feedback on revision 1 → A1 submits revision 2 → A2 opens the milestone in a fresh page load | Past deadline and bad link rejected beside the field with values kept; no form while waiting; after revision 2 the form is replaced by "All 2 revisions used."; feedback shows on revision 1; A2 sees revision 2 first with "No feedback yet", revision 1 with the feedback, and no feedback form | `e2e-02-03-journey.spec.ts` › E2E-02 | Revised by CHG-01: not run yet |
| E2E-03 | AC-03-5, AC-04-7 | E | Seeded DB (`db:seed`); Edge; Supervisor 2 logs in first to read Team Beta's URL | A1 views Alpha's team page, then opens Beta's team URL | Alpha page has no **New milestone** control; Beta page shows **Team not found** and no Beta member names (screenshot 09) | `e2e-02-03-journey.spec.ts` › E2E-03: no New milestone control for a student; another team's page by URL shows "Team not found" | Pass (1/1) |

## Scaffold verification (Issue #3; R-01 and R-02)

These checks belong to the scaffold PR and run before feature implementation. Their stable AC are in
[R-01-R-02-scaffold.md](R-01-R-02-scaffold.md). Re-run them on the Sprint 1 release and record the actual
test file/name, build command and result above or in the Part F results table.

| Test | AC | Lvl | Precondition / input | Action | Expected result | Actual test (file › name) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TEST-R01-01 | AC-R01-1 | I | Server started with test configuration; no cookie | GET `/api/health` | 200 `{ "status": "ok", "service": "CoursePM API" }`; no authentication required | `health.api.test.ts` › TEST-R01-01 (AC-R01-1): returns 200 { status: "ok", service: "CoursePM API" } without a session | Pass (1/1) |
| TEST-R01-02 | AC-R01-2 | I | `DATABASE_URL` and `DATABASE_URL_TEST` point to different PostgreSQL databases; no domain tables exist yet | Connect through the test configuration and run `SELECT current_database()`; separately start setup with a missing test URL and with the development URL reused | Connection selects the test database; both invalid configurations fail before migration, seed or cleanup. No domain write is required in the scaffold PR | `test-database.test.ts` › accepts a test database that differs from the development one and returns its name<br/>`test-database.test.ts` › refuses a missing or empty DATABASE_URL_TEST<br/>(+10 more) | Pass (12/12) |
| TEST-R01-03 | AC-R01-3 | I | Server running | GET an unknown `/api/*` path | 404 `{ error: { code: "NOT_FOUND", message: "Not found." } }`, with no stack/SQL text (may share implementation with TEST-02-07) | `health.api.test.ts` › TEST-R01-03 / TEST-02-07 (AC-R01-3, AC-02-8): an unknown /api route → 404 NOT_FOUND "Not found." wit | Pass (1/1) |
| TEST-R02-01 | AC-R02-1 | B + C | Client installed; health request pending, then mocked healthy or unavailable | Run `npm run build`; render the app and resolve/reject its health request | Build exits 0; app shows `API status: checking…`, then `API status: connected` on 200 with the expected health body or `API status: unreachable` on failure/unhealthy response | `app-health.test.tsx` › shows "API status: checking…" while the health request is pending<br/>`app-health.test.tsx` › shows "API status: connected" on 200 with the expected health body<br/>(+3 more)<br/>`npm --prefix client run build` | Pass (5/5) · build OK |

**Manual checks (they supplement the automated tests; they don't replace them):** MAN-01 restart the API and
confirm the data is still there (NFR-06); MAN-02 inspect the cookie flags in DevTools (NFR-04). Both **passed** on `v0.1.0` (`5d76a78`, 2026-11-15), scripted in Edge with the evidence in `artifacts/sprint-1/manual/` (`man-checks.txt` and screenshots); their automated counterparts are TEST-03-04 / TEST-R01-02 / E2E-01 (persistence) and TEST-01-13 (cookie flags).

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

**F-06 adds:** `feedback.api.test.ts` covers two concurrent first POSTs (one 201, one 409), a missing
session (401), missing or malformed submission IDs (404), and client-supplied `supervisorId` /
`submissionId` being ignored. `feedback-rules.unit.test.ts` and `feedback.api.test.ts` cover missing,
whitespace-only and non-string bodies. `feedback-ui.test.tsx` checks that a student sees **No feedback
yet** without a form, saving refreshes the list, and a 409 displays its message without clearing the
draft. Report these with their test file and test name in Part F.

**Part F TDD note for F-06.** The feedback body rule has a red/green pair (`34a77d7` → `1f57dce`),
as does the initial feedback UI (`085bd92` → `beaedb9`). The API tests were committed with their
implementation in `87246fb`, so there is no earlier failing API-test commit or red log. The 409 UI
case was added with `beaedb9` and has no separate red run. These cases are passing coverage, not
additional TDD evidence.

## Lab 5 supplemental automated cases (Issue #24)

These cases extend the Sprint 1 application for cloud deployment; they do not
change the Sprint 1 release results above. TEST-L5-01 to 04 are in
`server/tests/sprint-1/cloud-ready.api.test.ts`; TEST-L5-05 to 07 (Issue #25) are in
`server/tests/sprint-1/shutdown.unit.test.ts`. TEST-L5-08 to 11 (Issue #29) cover the release footer and
the deploy scripts.

| ID | Requirement | Check | Expected result |
| --- | --- | --- | --- |
| TEST-L5-01 | R-04, NFR-01 | Request `GET /api/ready` without a session while PostgreSQL is reachable | 200 with `status: ready` and `db: connected` |
| TEST-L5-02 | R-04, NFR-07 | Make the readiness DB query fail | 503 `NOT_READY` in the standard error shape, without DB details |
| TEST-L5-03 | NFR-01, R-04 | Request `GET /api/health` with a session-shaped cookie while session lookup would fail | 200 liveness response without a DB or session lookup |
| TEST-L5-04 | R-02, R-03 | Run Express in production mode with built client files; request `/`, an SPA path, a JS asset, and an unknown API path | UI and asset return 200 from the API origin; unknown API path remains JSON 404 |
| TEST-L5-05 | NFR-09, R-04 | Send SIGTERM to the shutdown handler with a fake server | Server closes first, then the DB pool disconnects, then exit code 0 |
| TEST-L5-06 | NFR-09, R-04 | Send SIGTERM then SIGINT | Only one shutdown runs; exit is called once |
| TEST-L5-07 | NFR-09, R-04 | Make the DB disconnect fail; separately, never finish closing | Exit code 1 on failure; forced exit 1 after the 8 s limit, not before |
| TEST-L5-08 | C-06, R-08 | Render the release footer with a full commit SHA | Shows `CoursePM release <short SHA>`, linked to that commit, full SHA in the title (`client/tests/sprint-1/release-footer.test.tsx`) |
| TEST-L5-09 | C-06, R-08 | Give the footer a missing, short, overlong, non-hex or injected value | Shows `CoursePM development build` and no link; whitespace and upper case are normalised |
| TEST-L5-10 | C-06, R-07 | Run `deploy/release.sh` against a fake `gcloud` (`deploy/tests/test_release_stub.sh`) | Digest resolved; migration awaited before the service update; rollback skips migration; a missing image or failed migration leaves the service unchanged; a bad tag or flag makes no `gcloud` call |
| TEST-L5-11 | C-06, R-07 | Run `deploy/smoke_test.py` against a mocked site (`deploy/tests/test_smoke.py`, 6 cases) | Passes only with health ok, DB connected, client HTML + bundle, `/api/teams` 401, and the expected SHA in the bundle; a 40-character SHA is required; a cold start is retried |
| MAN-L5-C03 | NFR-09, R-01, C-03 | Manual, in Cloud Shell: fresh clone; `cp .env.example .env`; `docker compose up --build -d`; `docker build` with no `.env`; `docker history` and image env checked for secrets; sign in as a seeded Student | Compose exits 0; `migrate` exits 0; `app` healthy; no secret in any layer or the image env; sign-in reaches My teams. Evidence in `docs/labs/lab-05/deployment.md` |
| MAN-L5-C04 | C-04, FR-04, FR-06, BR-07, NFR-02 | Manual, on the live URL: supervisor signs in and creates a milestone with revision limit 1; student submits once; student sends a second submission straight to the API | First submission accepted as revision 1; the second returns `409 REVISION_LIMIT_REACHED` and stores nothing. Evidence in `docs/labs/lab-05/deployment.md` |
| MAN-L5-C05 | C-05, R-04 | Manual: restart the service (new revision, no code change), redeploy through the pipeline, roll back to the #27 image and forward again, re-reading the C-04 record after each | Record and session survive every step; revisions `00003-d67`, `00004-68n`, `00005-jbt`, `00006-rxx`. Evidence in `docs/labs/lab-05/deployment.md` |

## Lab 6 regression cases (UAT defects)

Each accepted defect from the partner team's UAT (Team GG EZ, run `UAT-20261121-GGEZ` on `8c17581`)
gets a regression test that fails on the defective release before the fix. The tests live in
`server/tests/lab-06/` (API) and `client/tests/lab-06/` (UI); red and green logs are in `artifacts/lab-06/tdd/`.
TEST-L6-57-02 sends the out-of-range values to all seven ID routes; the non-canonical spellings are
sent to `GET /api/teams/:id` only (TEST-L6-57-03), because all seven routes read the ID through the
same `parseId`, which TEST-L6-57-01 covers for every spelling.

| ID | Requirement | Check | Expected result |
| --- | --- | --- | --- |
| TEST-L6-57-01 | NFR-02, Issue #57 (DEF-CP-01) | Call `parseId` with `1`, `2147483647`, values above INT4 (`2147483648`, `9999999999999`, `1e20`), and non-canonical forms (`0x1`, `1e0`, `+1`, `01`, ` 1`, `1.0`, `0`, `-1`, `abc`, empty) | Only `1` and `2147483647` are accepted; every other value returns `null` |
| TEST-L6-57-02 | AC-02-2, AC-02-3, NFR-02, Issue #57 | Send `2147483648`, `9999999999999` and `1e20` to the seven ID routes (`GET /api/teams/:id`, `GET`/`POST /api/teams/:id/milestones`, `GET /api/milestones/:id`, `GET`/`POST /api/milestones/:id/submissions`, `POST /api/submissions/:id/feedback`) with a session | Every request returns `404 NOT_FOUND` in the standard error shape; none returns 500 |
| TEST-L6-57-03 | AC-03-5, Issue #57 | As a member, request the own team by its real ID and by `0x…`, `…e0`, `+…`, `0…` and `….0` spellings of it | The real ID returns 200; every other spelling returns 404 and no team data |
| TEST-L6-58-01 | AC-01-2, FR-01, Issue #58 (DEF-CP-02) | `POST /api/auth/login` with a NUL byte inside a real account's e-mail (wrong and correct password), and at the end of the e-mail | 401 `INVALID_CREDENTIALS` with the same body as a wrong password, no cookie; never 500 |
| TEST-L6-58-02 | AC-01-2, Issue #58 | Login with SOH, US or DEL inside the e-mail, and with NUL appended to the account's correct password; then the real credentials | Each control-character attempt gets the same 401 and no cookie; the real credentials still return 200 with a cookie |
| TEST-L6-59-01 | BR-08, AC-05-5, Issue #59 (DEF-CP-03) | Unit: `validateSubmission` with `http:///path`, `http://.`, `http://...`, a raw space, an embedded newline or tab, one-slash and no-slash schemes, empty host labels; and with normal links, `%20`, `localhost`, an IP, one trailing dot, an upper-case scheme and surrounding spaces | Every bad link gets a `link` field error; every good link is accepted |
| TEST-L6-59-02 | AC-05-5, Issue #59 | API: a student posts the partner's five links to an open milestone, then a normal link | Each bad link gets 400 `VALIDATION_ERROR` with `fields.link` and nothing is stored; the normal link is stored as revision 1. The suite-level FK error in `59-red.txt` comes from the test's own `afterAll` deleting the team before its milestone and submission (fixed in `684c806`); it is not part of the defect. `59-red-clean.txt` repeats the RED with the fixed test file against the defective rule (`f1be16d`): 11 failed, 10 passed, no FK error |
| TEST-L6-63-01 | BR-05, BR-08, BR-10, AC-04-4, AC-05-5, AC-06-5, Issue #63 | Unit: `validateMilestone`, `validateSubmission` and `validateFeedback` with NUL, SOH or DEL in each title, description and feedback body; and a multi-line text with CR LF, LF and tab | Each control character gives a field error on that field only; the multi-line text is accepted |
| TEST-L6-63-02 | AC-04-4, AC-05-5, AC-06-5, Issue #63 | API: NUL in the milestone title/description, the submission title/description/link and the feedback body; then a two-line feedback | Each request gets 400 `VALIDATION_ERROR` naming the field and nothing is stored; the two-line feedback is saved (201) |
| TEST-L6-60-01 | AC-04-3, F-03 UI rule, Issue #60 (DEF-CP-04) | Component test: as a supervisor, open `/teams/2/milestones/new` while `GET /api/teams/2` returns 404 (`client/tests/lab-06/new-milestone-scope.test.tsx`) | **Team not found** heading; no Title field, no **Create milestone** button; no POST is sent |
| TEST-L6-60-02 | AC-04-1, Issue #60 | Component test: as a supervisor, open `/teams/1/milestones/new` while `GET /api/teams/1` returns the team | The form appears after the team loads and names the team |
| TEST-L6-60-03 | AC-02-10, Issue #60 | Component test: `GET /api/teams/1` returns 500 once, then the team; click **Retry** | Error alert with **Retry** and no form; after Retry the form appears (2 team requests). Added after the fix as extra coverage, not part of the RED run |

## Lab 7 change CHG-01 (Issue #<cr-issue>)

CHG-01 changes BR-07: revision n + 1 needs feedback on revision n (F-05 v1.2, AC-05-11 … AC-05-13).
The rows marked "Revised by CHG-01" above keep their IDs; their old expectation (v1.0) and the reason
for each revision are in [../../labs/lab-07/change-request.md](../../labs/lab-07/change-request.md) §5.
The **Actual test** and **Result** columns of those rows and of TEST-05-11 … TEST-05-13 are filled from
the CHG-01 release run. Every other row keeps its v1.0 result and is re-run as regression; fixtures that only gain the new
`awaitingFeedback` field or the required `latestHasFeedback` input (TEST-04-01, TEST-05-03, the list/detail
stats case and the client fixtures) keep their expectations and are listed in the change request §5. No test is
removed, skipped or weakened.

Red/green plan: the revised and new tests are committed first and run against the unchanged
implementation (pre-change commit); they must fail on assertions (`AWAITING_FEEDBACK` not returned,
`awaitingFeedback` missing), not on compilation. Logs: `artifacts/lab-07/tdd/red.log` and `green.log`.

