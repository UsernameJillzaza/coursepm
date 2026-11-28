# F-09 Course administration — feature contract

Version 1.1 · 2026-11-28 (AC-09-12 for the Sprint 2/3 routes, PR #76 review; 1.0 same day) · Issue: #73 (contract); implementation: #78 (S2-2) ·
Links: FR-14, BR-01, BR-02, BR-03, NFR-01, NFR-02, NFR-03, NFR-04, NFR-10, D-03, D-07 ·
Depends on: F-01 (sessions, `isActive`), F-02 (`teamScopeWhere`), F-03 (`Team`, `TeamMember`,
`SupervisorAssignment`)

## Purpose

Until now only the seed could create teams, put students and supervisors into them, or switch an
account off. FR-14 gives that work to a **Course Administrator**: a third role, `ADMIN` (BR-01).
An administrator manages the course structure (teams, who is in them, which accounts may sign in),
but **never sees or changes team work**: milestones, submissions, feedback and scores stay visible
only to the team's members and assigned supervisors (BR-02, BR-03). That keeps admins out of every
Sprint 1 data path, which also protects the tagged Lab 6 revision that shares the database
(see Data).

| An administrator can | An administrator cannot |
| --- | --- |
| list accounts (name, e-mail, role, active) and teams with their members and supervisors | open any milestone, submission, feedback or score (404, as for any out-of-scope user) |
| create a team (course code + name) | rename or delete a team |
| add an active **Student** to a team as a member; add an active **Supervisor** to a team as a supervisor | add an `ADMIN`, or a user with the wrong role, to a team |
| deactivate a Student or Supervisor account | deactivate an `ADMIN` account (no lock-out); re-activate an account; remove a member or supervisor |

The last column is the agreed Sprint 2 scope, not a defect list: removal, renaming and
re-activation are not in FR-14 and would need a new requirement.

## Behavior and workflow

1. The administrator signs in on the normal login page (F-01). After login an `ADMIN` is sent to
   `/admin`; Students and Supervisors still go to `/teams`.
2. `/admin` has two sections: **Teams** and **Accounts**.
3. **Create team:** the administrator enters a course code and a name. The server validates both and
   inserts the team. The pair `(courseCode, name)` is already unique in the database (F-03), so a
   duplicate gets 409 `TEAM_EXISTS`, including when two requests race.
4. **Add member / add supervisor:** on a team row the administrator picks an account from a list of
   active users of the right role and confirms. The server checks the team exists, the user exists,
   is active and has the right role, then inserts the `TeamMember` or `SupervisorAssignment` row. The
   composite primary key makes a repeat (or a race) a 409 `ALREADY_ASSIGNED`. A student may be in
   several teams (D-07).
5. **Deactivate:** on an account row the administrator presses **Deactivate** and confirms. In one
   transaction the server sets `isActive = false` and deletes all of that user's sessions. From that
   moment the account cannot log in, and any cookie it already had gets 401 on its next request
   (NFR-04). Its past milestones, submissions and feedback are kept unchanged.

### Check order

Admin routes target no team-owned record, so they use a role guard first:

authentication 401 → **role 403** (`ADMIN` only) → path ID 404 (`parseId`, then the team or user
must exist) → request shape 400 → state 409 → write.

Because none of these routes reveals team work, answering 403 before 404 leaks nothing that a
Supervisor or Student could not already see. The Sprint 1 rule "load the record through the scope
helper first, then check the role" (F-02) still applies to every team-owned route.

### Scope rule for `ADMIN` on existing routes

`teamScopeWhere(user)` (`server/src/access/scope.ts`) gets an explicit third branch: for `ADMIN` it
returns a filter that matches **no** team (`{ id: { in: [] } }`). Today an admin would fall into the
supervisor branch and match nothing only because admins are never assigned; the explicit branch
makes that a rule instead of a data accident. Effects:

- `GET /api/teams` → 200 `{ items: [] }`; any team, milestone, submission or feedback route → 404,
  exactly like an out-of-scope Supervisor (NFR-02, D-03).
- The same holds for every Sprint 2/3 route that loads a team-owned record through the scope helpers:
  F-07 compare, F-08 edit / extension / close / history, F-10 board and F-11 score (AC-09-12). Each
  is checked once that feature has merged.
- Role checks on those routes (student-only submit, supervisor-only feedback and milestone
  creation) are never reached by an admin, because scope answers first.
- F-12 already specifies `ADMIN` → 403 on the summary and 404 on an export; this rule keeps that
  true.

### Rule functions (pure, unit-tested)

In `server/src/rules/admin.ts`:

- `validateTeamInput(body)` → `{ ok: true, value: { courseCode, name } }` | `{ ok: false, fields }`.
  `courseCode`: trimmed, upper-cased, 2–20 characters of `A–Z`, `0–9` and `-`
  ("Course code must be 2–20 letters, digits or hyphens."). `name`: trimmed, 2–80 characters, no
  control characters (`hasSingleLineControl` from `rules/text.ts`)
  ("Team name must be 2–80 characters."). Unknown keys are ignored.
- `checkAssignable(user, wanted: 'STUDENT' | 'SUPERVISOR')` → `{ ok: true }` |
  `{ ok: false, message }`: the user must be active and have exactly the wanted role; an `ADMIN` is
  never assignable. Messages: "Only an active student can be added as a member." /
  "Only an active supervisor can be assigned to supervise a team."
- `checkDeactivatable(target, actor)` → `{ ok: true }` | `{ ok: false, code }` with
  `CANNOT_DEACTIVATE_ADMIN` (target is an `ADMIN`, which includes the actor themselves) or
  `ALREADY_INACTIVE`.

## UI

- **Routing:** a new route guard `RequireRole` (next to `RequireAuth`) and a shared `NoAccess`
  component ("You don't have access to this page." with a link to My teams) are added here;
  F-12 reuses them. `/admin` is wrapped in `RequireRole role="ADMIN"`: a Student or Supervisor who
  opens it sees `NoAccess`, and the server still answers 403 to every admin API call.
- **Top bar:** shows "Admin" next to the name for an `ADMIN`; the admin sees an **Admin** link and no
  My teams link.
- **Teams section:** a table (course code, name, members, supervisors) with the loading, empty
  ("No teams yet.") and error states of NFR-10. A **New team** form (Course code, Team name) shows
  field errors under each input and keeps the typed values; 409 `TEAM_EXISTS` shows "A team with
  this course code and name already exists." in the alert. Each row has **Add member** and
  **Add supervisor**: a select listing only active accounts of the right role that are not already
  in that team, and an **Add** button disabled until one is chosen.
- **Accounts section:** a table (name, e-mail, role, status) with a role filter. Active Student and
  Supervisor rows have **Deactivate**, which opens a confirmation dialog: "Deactivate <name>? They
  will be signed out and cannot sign in again. Their past work is kept." with **Deactivate** /
  **Cancel**. `ADMIN` rows and inactive rows show no button; inactive rows show an `Inactive` badge.
- Every 400/409 from the API is shown (field errors under inputs, other errors in the alert); hiding a
  button is never the only control (NFR-02).

## API

All routes are under `/api/admin`, need a session (401 `UNAUTHENTICATED` without one) and the `ADMIN`
role (403 `FORBIDDEN` "Only a course administrator can do this." otherwise).

| Method & path | Request | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/admin/users` | query `role?` (`STUDENT`/`SUPERVISOR`/`ADMIN`), `active?` (`true`/`false`) | 200 `{ items: [adminUser] }` | 400, 401, 403 |
| `GET /api/admin/teams` | — | 200 `{ items: [adminTeam] }` | 401, 403 |
| `POST /api/admin/teams` | `{ courseCode, name }` | 201 `{ team: adminTeam }` | 400, 401, 403, 409 `TEAM_EXISTS` |
| `POST /api/admin/teams/:teamId/members` | `{ userId }` | 201 `{ team: adminTeam }` | 400, 401, 403, 404, 409 `ALREADY_ASSIGNED` |
| `POST /api/admin/teams/:teamId/supervisors` | `{ userId }` | 201 `{ team: adminTeam }` | 400, 401, 403, 404, 409 `ALREADY_ASSIGNED` |
| `POST /api/admin/users/:userId/deactivate` | — | 200 `{ user: adminUser }` | 401, 403, 404, 409 `CANNOT_DEACTIVATE_ADMIN` / `ALREADY_INACTIVE` |

- **`adminUser`**: `{ id, name, email, role, isActive }`. Never a password or hash (NFR-03). Ordered by
  role (`ADMIN`, `SUPERVISOR`, `STUDENT`), then name, then id.
- **`adminTeam`**: `{ id, courseCode, name, members: [{ id, name }], supervisors: [{ id, name }] }`
  (the F-03 team shape). Ordered by course code, then name.
- **Errors** use the standard shape from `http.ts`:
  - shape → 400 `VALIDATION_ERROR` "Please correct the highlighted fields." with `fields`
    (`courseCode`, `name`, `userId`, `role`, `active`). A `userId` that is not a canonical positive
    integer (`parseId` rules) → `fields.userId` "Choose an account.".
  - a `userId` that names no user, or a user who is inactive or has the wrong role → 400
    `fields.userId` with the `checkAssignable` message (the admin already sees every account, so this
    reveals nothing).
  - unknown `:teamId` / `:userId` in the path → 404 `NOT_FOUND` "Team not found." / "Account not
    found.".
  - 409 messages: `TEAM_EXISTS` "A team with this course code and name already exists.";
    `ALREADY_ASSIGNED` "This account is already in this team."; `CANNOT_DEACTIVATE_ADMIN`
    "Administrator accounts cannot be deactivated here."; `ALREADY_INACTIVE` "This account is already
    inactive.".
- `GET /api/auth/me` and the login response carry `role: "ADMIN"` for an administrator (F-01 shape,
  unchanged).

## Data (additive only — the tagged Lab 6 revision shares the database)

- `Role` enum: add the value **`ADMIN`**. Nothing is renamed or dropped.
- No new table. Teams, memberships and assignments use the F-03 tables and their existing unique
  keys; deactivation uses `User.isActive` (F-01) and deletes `Session` rows.
- **Seed:** `src/seed/demo.ts` adds one account, `admin@coursepm.test` ("Course Admin", `ADMIN`,
  password from `SEED_PASSWORD` like every demo account). It is **not** added to any team. The seed
  stays idempotent.
- **Enforced in code only** (no database CHECK can see the user's role from `TeamMember`), under
  tests: members are active `STUDENT` users, supervisors are active `SUPERVISOR` users, and no
  `ADMIN` is ever in `TeamMember` or `SupervisorAssignment`. This replaces the System SDS sentence
  "only the seed writes these tables until F-09 adds admin screens with the same checks".
- **Migration:** `<UTC timestamp>_admin_role` (`ALTER TYPE "Role" ADD VALUE 'ADMIN'`). Migration order
  = merge order: if F-08's migration merges first, this folder is renamed to a later timestamp after
  `sprint2-staging` is merged in.
- **Known limit:** the tagged Lab 6 revision (`lab6-v021`, code `a342ed5`) was generated without
  `ADMIN`. Its Prisma client cannot read a user whose role is `ADMIN`, so signing in as the admin
  **through that URL** fails with a server error. No Sprint 1 data path reads an admin (admins are in
  no team and author no work), so every other account and page on that URL keeps working. Admin
  checks and demonstrations use the current revision.

**Files expected to change:**
- `server/prisma/schema.prisma` + migration; `server/src/seed/demo.ts`
- `server/src/access/scope.ts` (the `ADMIN` branch); new `server/src/rules/admin.ts`,
  `server/src/admin/routes.ts`; `server/src/app.ts` (mount `/api/admin`)
- client: `RequireRole`, `NoAccess`, the admin page and its API helpers, the top bar and the
  post-login redirect
- `docs/system-sds.md` (role list, data-integrity paragraph, route table), `docs/srs.md` (BR-01
  note), the F-02 contract (the `ADMIN` scope branch), `docs/traceability.md`

## Acceptance criteria

| ID | Given / When / Then |
| --- | --- |
| AC-09-1 | The seeded admin signs in → 200 with `role: "ADMIN"`; `GET /api/auth/me` returns the same role. The login and every admin response contain no `passwordHash` or password. |
| AC-09-2 | Student A1 and Supervisor 1 each call all six admin routes → 403 `FORBIDDEN` with nothing created or changed. Without a session → 401. |
| AC-09-3 | The admin creates team `CPE334-DEMO` / `Team Delta` → 201 with the `adminTeam` shape (empty members and supervisors); it appears in `GET /api/admin/teams`. Creating the same pair again, also with the course code in lower case or with spaces around it → 409 `TEAM_EXISTS`; two identical creates sent at the same moment → exactly one 201 and one 409, one row. |
| AC-09-4 | Create-team validation: course code of 1 or 21 characters, with a space or `_`, missing; name of 1 or 81 characters, with a NUL, missing → 400 naming each failing field, nothing stored. Course code of 2 and 20, name of 2 and 80 characters → accepted. |
| AC-09-5 | The admin adds Beta Student 1 as a member of Team Delta and Supervisor 2 as its supervisor → 201 each, and the returned team lists them. Beta Student 1 then sees Team Delta in `GET /api/teams` and Team Beta still (D-07); Supervisor 2 sees Team Delta among its teams. Adding the same person again → 409 `ALREADY_ASSIGNED`. |
| AC-09-6 | Adding a Supervisor as a member, a Student as a supervisor, the admin itself either way, an inactive Student, an unknown user ID or `userId: "abc"` → 400 `fields.userId`, nothing stored. An unknown or malformed `:teamId` → 404. |
| AC-09-7 | The admin deactivates Alpha Student 2 → 200 with `isActive: false`. A2's existing session then gets 401 on `GET /api/teams`, A2's session rows are gone, and A2 signing in gets 401 `INVALID_CREDENTIALS` (the same body as a wrong password, NFR-04). A2's earlier revisions and the feedback on them are unchanged and still visible to A1 and Supervisor 1. |
| AC-09-8 | Deactivating an `ADMIN` (including the admin itself) → 409 `CANNOT_DEACTIVATE_ADMIN`; an already inactive account → 409 `ALREADY_INACTIVE`; an unknown or malformed `:userId` → 404. Nothing changes. |
| AC-09-9 | The admin calls the Sprint 1 routes: `GET /api/teams` → 200 `{ items: [] }`; `GET /api/teams/:alpha`, `GET /api/teams/:alpha/milestones`, `GET /api/milestones/:id`, `GET /api/milestones/:id/submissions`, `POST /api/teams/:alpha/milestones`, `POST /api/milestones/:id/submissions` and `POST /api/submissions/:id/feedback` → 404 each, with no Alpha title in any body. |
| AC-09-10 | `GET /api/admin/users?role=STUDENT&active=true` lists exactly the active students in the documented order; `role=TEACHER` or `active=yes` → 400 naming the field. |
| AC-09-11 | UI: the admin lands on `/admin` after login and sees the Teams and Accounts sections with their loading, empty and error states; the New team form shows field errors under its inputs and keeps the values; 409 shows the alert; the add selects list only eligible accounts; Deactivate asks for confirmation and **Cancel** sends nothing; no Deactivate button on `ADMIN` or inactive rows. A Student or Supervisor who opens `/admin` sees `NoAccess`, and has no Admin link. |
| AC-09-12 | Once each feature has merged, the admin calls its routes on an Alpha milestone or team: F-07 `GET …/compare?a=1&b=2`; F-08 `PATCH /api/milestones/:id`, `POST …/extensions`, `POST …/close`, `GET …/history`; F-10 `GET /api/teams/:alpha/board`; F-11 `GET`, `PUT …/score` and `POST …/score/release` → 404 each, no Alpha title in any body, nothing stored. |

## Software test specification (planned)

TEST-09-01 … TEST-09-14 and TEST-UI-09 in the Sprint 2 [sts.md](sts.md), with levels, inputs and
expected results. Each RED test is committed before its implementation. Logs go in
`artifacts/sprint-2/tdd/F-09-*.txt`.

## Definition of Done

The Sprint 1 [definition-of-done.md](../sprint-1/definition-of-done.md) applies, plus:
- [ ] The migration only adds the enum value. After `prisma migrate deploy` on a copy of the Lab 6
      database, the `a342ed5` code still passes its health check, login of a Student and a
      Supervisor, and the milestone list (the admin login on that code is the documented known limit).
- [ ] Every AC-09-n has a passing test in the STS, with file › name and the tested commit. The
      traceability rows are filled in.
- [ ] The Sprint 1 tests (TEST-01-*, TEST-02-*, TEST-03-*) still pass without their expectations
      being changed; the F-02 contract notes the `ADMIN` scope branch.
- [ ] The seed creates the admin account idempotently, and the private test-account handoff lists it
      (label and role only in Git).
- [ ] The PR is reviewed by Achirawit and merged into `sprint2-staging`, and the Issue moves to Done
      on board #8.
