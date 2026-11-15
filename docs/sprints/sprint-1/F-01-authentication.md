# F-01 Authentication and session — feature contract

Version 1.0 · 2026-11-15 · Issue: #2 (contract); implementation: #4 · Links: FR-01, FR-02, BR-01, NFR-01, NFR-03, NFR-04

## Behavior and workflow
1. The user opens `/login` and enters an e-mail and password.
2. The server normalizes the e-mail (trim + lowercase), looks up an **active** user and verifies the
   scrypt hash (a dummy hash is checked for an unknown e-mail, so timing is the same).
3. On success: create a `Session` (store the SHA-256 of a 32-byte random token, `expiresAt = now +
   SESSION_TTL_HOURS`), set the `cpm_session` cookie, return the public user.
4. `GET /api/auth/me` returns the user of a valid, unexpired session.
5. `POST /api/auth/logout` deletes the session row and clears the cookie (idempotent: 204 even without a session).

**Rules and failure cases.** A wrong password, an unknown e-mail and an inactive account all return
the same 401 `INVALID_CREDENTIALS` message, "E-mail or password is incorrect." Missing fields return
400 `VALIDATION_ERROR`. A session belonging to an account that becomes inactive returns 401 on its next
authenticated request. The role always comes from the database. Any `role` field in the request is ignored.

## UI
`/login`: e-mail + password fields, **Log in** button (disabled while sending). Missing fields show
field-level messages; invalid credentials show one generic alert so the UI does not reveal which field
was incorrect.
On success go to `/teams`. The top bar shows name + role and **Log out** (→ `/login`).

## API
| Method & path | Request | Success | Errors |
| --- | --- | --- | --- |
| `POST /api/auth/login` | `{ "email": string, "password": string }` | 200 `{ "user": { id, name, email, role } }` + `Set-Cookie` | 400, 401 |
| `GET /api/auth/me` | cookie | 200 `{ "user": {…} }` | 401 |
| `POST /api/auth/logout` | cookie optional | 204, cookie cleared | — |

## Data
`User` (email unique, role enum `STUDENT`\|`SUPERVISOR`, passwordHash, isActive) and `Session`
(id = token hash, userId FK cascade, expiresAt). Migration `<timestamp>_users_sessions`.
The single idempotent demo seed is `src/seed/demo.ts`, which creates accounts, teams, memberships and
supervisor assignments together once F-03 adds the team tables. F-01 API tests use its account
creation helper to set up isolated users in `DATABASE_URL_TEST` (including Student A1 and Supervisor 1
with passwords hashed from `SEED_PASSWORD`); no separate partial demo seed is needed.

## Acceptance criteria
| ID | Given / When / Then |
| --- | --- |
| AC-01-1 | Given a seeded active user, when they log in with the correct password, then the response is 200 with their public user and an `HttpOnly` `cpm_session` cookie. |
| AC-01-2 | Given a wrong password **or** an unknown e-mail, the response is 401 with the same message, and no cookie is set. Missing fields → 400. |
| AC-01-3 | Given a logged-in user, `GET /api/auth/me` returns their id, name, e-mail and role. |
| AC-01-4 | After logout, the old cookie gets 401 from `/api/auth/me`, and the session row no longer exists. |
| AC-01-5 | Stored passwords match `scrypt$…`; no response contains `password` or `passwordHash`. |
| AC-01-6 | Sending `"role": "SUPERVISOR"` in the login body doesn't change the role returned for a student. |
| AC-01-7 | A session whose `expiresAt` has passed gets 401 and is deleted. |
| AC-01-8 | An inactive account cannot log in (401 `INVALID_CREDENTIALS`); a previously valid session for that account gets 401 on its next authenticated request. |
| AC-01-9 | Calling logout without a session returns 204 with no response body. |
| AC-01-10 | In the login form, missing e-mail or password shows a message beside that field and keeps entered values; invalid credentials show one generic alert. |
| AC-01-11 | After login, the `Session` row stores the SHA-256 hash of the cookie token, not the token itself; its expiry is 8 hours after creation. The cookie is `HttpOnly`, `SameSite=Lax` and `Path=/` (`Secure` in production). |
