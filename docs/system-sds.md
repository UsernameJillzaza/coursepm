# CoursePM — System-Level Software Design Specification (SDS)

Version 0.1 · 2026-11-15 · implements [srs.md](srs.md) v0.1.

## 1. Architecture and stack

CoursePM is a **modular monolith** in three logical layers, using the same stack as our individual TokTickIT
labs (spec §5.1 encourages this; we already know how to test it).

| Layer | Technology | Responsibility |
| --- | --- | --- |
| UI | React 19 + Vite + TypeScript, React Router, Bootstrap 5 | Screens, client-side form hints, calling the API with the session cookie. **No business rule is trusted here.** |
| API / application | Node.js 24, Express 5, TypeScript | Authentication, authorization (role + record scope), validation, business rules BR-04 … BR-10, error mapping. |
| Data | PostgreSQL 18 through Prisma ORM 7 (migrations + seed) | Persistent storage; uniqueness and foreign-key constraints back up the rules (for example NFR-05). |
| Tests | Vitest (unit, API with Supertest against a real test database), React Testing Library, Playwright (E2E) | Verification at each level. |

```mermaid
flowchart LR
  B[Browser<br/>React SPA] -- "HTTPS JSON + HttpOnly cookie" --> A[Express API<br/>/api/*]
  A -- "Prisma Client" --> D[(PostgreSQL)]
  subgraph API
    M1[authenticate] --> M2[requireAuth] --> M3[scope loader<br/>record in caller's scope?] -- "no → 404" --> X[ ]
    M3 -- yes --> M4[role check<br/>for the operation] -- "wrong role → 403" --> Y[ ]
    M4 -- ok --> S[validation → rule functions<br/>→ transaction]
  end
```

**Where rules are enforced.** Every request passes `authenticate` (reads the session) and
`requireAuth` (401 without one). For a route that targets a record (a team, milestone or submission),
the **scope loader runs first**: it fetches the record *together with* the caller's membership or
assignment and answers 404 when the record is missing **or** outside the caller's scope. Only then is
the **role checked for the operation** (403), so an outsider never learns that a record exists (D-03).
Routes without a target record (for example `GET /api/teams`, which is filtered by scope) need no
separate role check. Validation (400) and the rule checks (deadline, revision limit; 409) are small pure
functions in `server/src/rules/`, so they are unit-testable. The handler writes inside a Prisma
transaction.

**Concurrent submissions (NFR-05).** Two requests can read the same number of revisions and both try
revision *n + 1*. The insert runs in a transaction that re-reads the milestone and the current revision
count and re-applies **both** rules (deadline and revision limit) with the server clock. `UNIQUE
(milestoneId, revision)` makes the losing insert fail; the server then **retries the whole transaction
(up to 3 attempts)**, so the loser gets the next free revision if capacity remains, or `409
REVISION_LIMIT_REACHED` / `409 DEADLINE_PASSED` if the fresh state no longer allows it. If all
attempts collide, the client receives `409 CONFLICT` ("try again"). Covered by TEST-05-08 (two at once
with capacity → revisions 1 and 2) and a limit-1 variant (two at once → one 201, one 409).

**Communication.** The client and API share one origin in development through the Vite proxy (`/api`
→ `localhost:3000`), so the cookie stays first-party. In production, Express serves the built client
(one container, see §6).

## 2. Data model

```mermaid
erDiagram
  User ||--o{ Session : has
  User ||--o{ TeamMember : "is member"
  User ||--o{ SupervisorAssignment : supervises
  Team ||--o{ TeamMember : has
  Team ||--o{ SupervisorAssignment : "supervised by"
  Team ||--o{ Milestone : has
  Milestone ||--o{ Submission : receives
  User ||--o{ Submission : submits
  Submission ||--o| Feedback : "has (≤1)"
  User ||--o{ Feedback : writes
```

| Entity | Key fields | Constraints / ownership |
| --- | --- | --- |
| `User` | id, email, name, role (`STUDENT`\|`SUPERVISOR`; `ADMIN` added in Sprint 2), passwordHash, isActive, createdAt | email unique, lowercase. One role per user (BR-01). |
| `Session` | id (SHA-256 of token), userId, expiresAt, createdAt | FK → User, cascade delete. |
| `Team` | id, name, courseCode, createdAt | (courseCode, name) unique. |
| `TeamMember` | teamId, userId | PK (teamId, userId); seed allows only `STUDENT` users. |
| `SupervisorAssignment` | teamId, userId | PK (teamId, userId); seed allows only `SUPERVISOR` users. |
| `Milestone` | id, teamId, title, description, deadline (UTC), maxRevisions (1–5), createdById, createdAt | FK → Team and the creator. A CHECK constraint keeps maxRevisions within 1–5. **UNIQUE (id, teamId)** so submissions can reference the pair. |
| `Submission` | id, milestoneId, teamId, revision, title, description, link, submittedById, submittedAt | **UNIQUE (milestoneId, revision)** for NFR-05. teamId is copied from the milestone so scope checks are a single join, and a **composite FK (milestoneId, teamId) → Milestone (id, teamId)** makes the database reject a submission whose teamId differs from its milestone's team, so authorization can never use the wrong team. Never updated or deleted (BR-07). |
| `Feedback` | id, submissionId (unique), supervisorId, body, createdAt | **UNIQUE (submissionId)** for BR-10; FK → Submission keeps the feedback/revision link. |

**Setup.** `npx prisma migrate dev` builds the schema from versioned migrations.
`npx prisma db seed` runs `prisma/seed.ts`, which is idempotent (users upserted by e-mail, teams by
their unique key **(courseCode, name)**, memberships and assignments by their composite primary keys) and
creates: 2 supervisors, 6 students, and 3 teams (Team Alpha supervised by Supervisor 1; Team Beta and
Team Gamma supervised by Supervisor 2). Demo passwords come from `SEED_PASSWORD` in `.env` and are
never written in the repository.

## 3. UI structure and conventions

| Route | Screen | Roles |
| --- | --- | --- |
| `/login` | Login form | public |
| `/teams` | My teams (cards with member names) | Student, Supervisor |
| `/teams/:teamId` | Team detail: members, milestone list with status badges; **New milestone** button | Student, Supervisor (button for Supervisor only) |
| `/teams/:teamId/milestones/new` | Create milestone form | Supervisor |
| `/milestones/:milestoneId` | Milestone detail: deadline countdown, revisions used / limit, submit form (Student, while open), revision list with feedback, feedback form (Supervisor) | Student, Supervisor |

**Shared behavior (R-02).** A top bar shows the user's name and role and a **Log out** button. A
`RequireAuth` route wrapper sends a user with no session to `/login`, and any 401 from the API while a
page is open (session expired, logged out elsewhere, account deactivated) does the same. Every form disables its submit
button while saving (no duplicate submissions), shows field errors returned from the API next to the
field, and keeps the typed values on error. Every list has a loading spinner, an empty state
("No milestones yet") and an error alert with **Retry**. Times are shown in Asia/Bangkok
(`dd MMM yyyy HH:mm`).

## 4. API conventions

- Base path `/api`, JSON only, resource-oriented paths, plural nouns.
- Success: `200` (read), `201` (create) with the created resource; lists are `{ "items": [...] }`.
- Error body is always `{ "error": { "code": "VALIDATION_ERROR", "message": "…", "fields": { "link": "…" } } }`.

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Field rules failed (BR-05, BR-08, BR-10 length). |
| 401 | `UNAUTHENTICATED` | No session, an expired session or a deleted session. |
| 403 | `FORBIDDEN` | The record is in scope but the role may not perform the operation (a student creating a milestone or recording feedback). |
| 404 | `NOT_FOUND` | The record does not exist **or** is outside the user's scope (D-03). |
| 409 | `DEADLINE_PASSED`, `REVISION_LIMIT_REACHED`, `FEEDBACK_EXISTS` | A business rule rejects the state change (BR-06, BR-07, BR-10). |
| 409 | `CONFLICT` | A concurrent submission kept winning the same revision number through every retry (§1, NFR-05); the client may simply try again. |
| 500 | `INTERNAL_ERROR` | Unexpected; generic message, details only in the server log. |

Validation happens on the server for every input; client checks are only hints. Unknown body fields
are ignored. IDs in paths are positive integers; anything else returns 404.

**Sprint 1 endpoints** (full contracts in [sprints/sprint-1/](sprints/sprint-1/)):

| Method & path | Feature |
| --- | --- |
| `GET /api/health` | — |
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` | F-01 |
| `GET /api/teams` · `GET /api/teams/:teamId` | F-03 |
| `GET /api/teams/:teamId/milestones` · `POST /api/teams/:teamId/milestones` · `GET /api/milestones/:milestoneId` | F-04 |
| `GET /api/milestones/:milestoneId/submissions` · `POST /api/milestones/:milestoneId/submissions` | F-05 |
| `POST /api/submissions/:submissionId/feedback` | F-06 |

## 5. Roles, permissions and authentication

**Role / permission matrix.** "Own team" = a team the student belongs to; "assigned team" = a team the
supervisor is assigned to. ✗ outside scope → 404; ✗ wrong role on an accessible record → 403. The
**Administrator** column is the planned Sprint 2 design (F-09, FR-14); it is not implemented in Sprint 1,
where teams and accounts come from the seed (D-04).

| Operation | Student | Supervisor | Administrator (Sprint 2) | Unauthenticated |
| --- | --- | --- | --- | --- |
| Log in | ✓ | ✓ | ✓ | ✓ |
| View own identity, log out | ✓ | ✓ | ✓ | 401 |
| List teams | own teams only | assigned teams only | all teams | 401 |
| View team + members | own team | assigned team | any team | 401 |
| List / view milestones | own team | assigned team | any team (read-only) | 401 |
| Create milestone | 403 | assigned team only | 403 (supervisors own milestones) | 401 |
| Submit / resubmit | own team, before the deadline, within the limit | 403 | 403 | 401 |
| View submissions | own team | assigned team | any team (read-only) | 401 |
| Record feedback | 403 | assigned team only, one per revision | 403 | 401 |
| View feedback | own team | assigned team | any team (read-only) | 401 |
| Create teams, assign students/supervisors | 403 | 403 | ✓ | 401 |
| Deactivate / reactivate an account | 403 | 403 | ✓ (not their own account) | 401 |

**Account deactivation (`isActive`).** Sprint 1 already enforces it: an inactive account cannot log in
(the same 401 `INVALID_CREDENTIALS` as a wrong password, so it reveals nothing), and every request
re-reads the session's user, so an existing session of a deactivated user is **rejected on the next
authenticated request** (401). From Sprint 2, the deactivation action (F-09) also **deletes all of that
user's sessions immediately**, so the account is signed out everywhere at once rather than at its next
request.

**Credentials and sessions.**
- Passwords are hashed with **scrypt** (`node:crypto`, N=16384, r=8, p=1, 16-byte random salt, 64-byte
  key), stored as `scrypt$N$r$p$salt$key`, and compared in constant time. Login against an unknown
  e-mail still runs a dummy hash, so response time doesn't reveal which accounts exist.
- On login, the server makes a 32-byte random token, stores only its SHA-256 hash in `Session` with
  `expiresAt = now + 8 h`, and sets the cookie `cpm_session` (`HttpOnly`, `SameSite=Lax`, `Path=/`,
  `Secure` when `NODE_ENV=production`).
- `GET /api/auth/me` returns `{ id, name, email, role }` for the current session.
- Logout deletes the session row and clears the cookie; reusing the old cookie returns 401. An expired
  session is deleted when it is next seen.
- The role always comes from the database row of the session's user, **never from the request**.

## 6. Configuration and delivery design

| Variable | Purpose | Example (`.env.example`) |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://cpm:cpm@localhost:5432/coursepm` |
| `DATABASE_URL_TEST` | Separate database for automated tests | `postgresql://cpm:cpm@localhost:5432/coursepm_test` |
| `PORT` | API port | `3000` |
| `NODE_ENV` | `development` / `test` / `production` | `development` |
| `SESSION_TTL_HOURS` | Session lifetime | `8` |
| `SEED_PASSWORD` | Password given to the seeded demo accounts | *(choose locally; never committed)* |

Real `.env` files are git-ignored; only `.env.example` is committed. No secret is ever sent to the client
bundle.

**Planned GCP deployment (built in Lab 5).** A multi-stage `Dockerfile` builds the client and the
server into one Node image. At startup the container runs `prisma migrate deploy`, then serves `/api`
and the static client. **Cloud Run** runs the container; **Cloud SQL for PostgreSQL** holds the data
(durable across restarts and redeploys); **Secret Manager** supplies `DATABASE_URL`; **Artifact
Registry** stores the images; GitHub Actions runs build + tests on each PR and deploys `main`. Stateless
containers work because sessions live in the database, not in memory.
