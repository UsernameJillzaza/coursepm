# F-03 Teams and membership (seeded) — feature contract

Version 1.0 · 2026-11-15 · Issue: #2 (contract); implementation: #5 · Links: FR-03, BR-02, BR-03, D-04, D-07, NFR-06

## Behavior
F-03 extends the F-01 account seed with the remaining demo accounts, teams, membership and supervisor
assignments (see SDS §2). The complete seed is
idempotent: running it twice gives the same rows. Users see only the teams in their scope (F-02).

## UI
`/teams`: one card per team (name, course code, member names, supervisor names); loading / empty
("You are not in any team yet") / error states. Clicking a card opens `/teams/:teamId`.

## API
| Method & path | Success | Errors |
| --- | --- | --- |
| `GET /api/teams` | 200 `{ items: [{ id, name, courseCode, members: [{id,name}], supervisors: [{id,name}] }] }` | 401 |
| `GET /api/teams/:teamId` | 200 `{ team: { …same } }` | 401, 404 |

## Data
`Team` (unique courseCode+name), `TeamMember` (PK teamId+userId), `SupervisorAssignment` (PK
teamId+userId). Migration `002_teams`. Seed `prisma/seed.ts`.

## Acceptance criteria
| ID | Given / When / Then |
| --- | --- |
| AC-03-1 | Student A1 (Team Alpha) sees exactly Team Alpha with its members; Supervisor 2 sees exactly Beta and Gamma. |
| AC-03-2 | Student A1 requesting Team Beta gets 404. |
| AC-03-3 | Supervisor 1 requesting Team Beta gets 404. |
| AC-03-4 | Running the seed twice leaves the same number of users, teams and memberships, and the data is still there after the API restarts. |
