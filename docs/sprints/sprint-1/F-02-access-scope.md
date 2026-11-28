# F-02 Access-scope enforcement (cross-cutting) — feature contract

Version 1.0 · 2026-11-15 · Issue: #2 (contract); implementation: #5 · Links: BR-02, BR-03, NFR-01, NFR-02, NFR-07, NFR-10

## Behavior
- `authenticate` middleware: reads the cookie, loads the session + user, and sets `req.user`, or leaves
  it empty.
- `requireAuth` → 401 `UNAUTHENTICATED` when `req.user` is missing.
- A handler checks the role after loading the target record in scope and returns 403 `FORBIDDEN`
  when the role differs. An out-of-scope student therefore gets 404 before the role check (D-03).
- Scope helpers in `server/src/access/scope.ts`:
  - `teamScopeWhere(user)` → a Prisma `where` that limits teams to `members.some({userId})` for students and
    `supervisors.some({userId})` for supervisors. **Sprint 2 (F-09, Issue #78):** an explicit third branch
    gives an `ADMIN` `{ id: { in: [] } }`, which matches no team, so every team-owned route answers 404 to an
    administrator (TEST-09-12). The Sprint 1 branches are unchanged.
  - `loadTeamForUser(user, teamId)`, `loadMilestoneForUser(user, milestoneId)`,
    `loadSubmissionForUser(user, submissionId)` → the record, or `null` (handler returns 404).
- Error handler: a known `AppError` maps to its status/code; anything else returns 500 `INTERNAL_ERROR`
  with a generic message (the stack goes only to the server log).

The forced-error integration check creates a small probe app in the test file that reuses the exported
`errorHandler`. No test-only route or handler is registered in the application.

**UI (cross-cutting).** A protected request returning 401 redirects to `/login`. Team, milestone and
submission lists show loading, empty and error states; an error offers **Retry** (R-02). No data model
change is required for this feature. The error shape and status codes apply to every `/api/*` route.

## Acceptance criteria
| ID | Given / When / Then |
| --- | --- |
| AC-02-1 | Without a cookie, every protected route (`/api/auth/me`, `/api/teams*`, `/api/milestones/*`, `/api/submissions/*`) returns 401 with no data fields. |
| AC-02-2 | A student of Team Alpha requesting a Team Beta milestone or its submissions gets 404, with no Beta data in the body. |
| AC-02-3 | A supervisor not assigned to Team Alpha gets 404 for Alpha's team, milestones and submissions. |
| AC-02-4 | A student of Team Alpha calling `POST /api/teams/{alpha}/milestones` gets 403, and no milestone is stored. |
| AC-02-5 | A student of Team Alpha calling `POST /api/submissions/{id}/feedback` gets 403, and no feedback is stored. |
| AC-02-6 | A forced internal error in a probe app using the exported `errorHandler` returns 500 `{ error: { code: "INTERNAL_ERROR", message } }` with no stack or SQL text. |
| AC-02-7 | When a protected API request returns 401 while a page is open, the client redirects to `/login` without showing private data. |
| AC-02-8 | Malformed JSON returns 400 `VALIDATION_ERROR`; a JSON body over 100 kB returns 413 `PAYLOAD_TOO_LARGE`; an unknown `/api/*` route returns 404 `NOT_FOUND`. Each uses the standard error shape without stack or SQL text. |
| AC-02-9 | A student posting a milestone to another team's ID receives 404, even though the same operation on their own team would return 403. Neither request stores a milestone. |
| AC-02-10 | Team, milestone and submission lists each show a loading state, an empty state and an error state with **Retry**. |
