# F-03 Teams and membership (seeded) — feature contract

Version 1.0 · 2026-11-15 · Issue: #2 (contract); implementation: #5 · Links: FR-03, BR-02, BR-03, D-04, D-07, NFR-06

## Behavior
F-03 completes the single idempotent `src/seed/demo.ts` seed after the team tables exist. It creates
the full set of demo accounts, teams, memberships and supervisor assignments together (see SDS Section 2).
F-01 tests use the account creation helper from that module before the full seed can run. Users see
only teams in their scope (F-02).

## UI
`/teams`: one card per team (name, course code, member names, supervisor names); loading / empty
("You are not in any team yet") / error states. Clicking a card opens `/teams/:teamId`. An
out-of-scope or missing team URL shows **Team not found** without rendering that team's data.

## API
| Method & path | Success | Errors |
| --- | --- | --- |
| `GET /api/teams` | 200 `{ items: [{ id, name, courseCode, members: [{id,name}], supervisors: [{id,name}] }] }` | 401 |
| `GET /api/teams/:teamId` | 200 `{ team: { …same } }` | 401, 404 |

## Data
`Team` (unique courseCode+name), `TeamMember` (PK teamId+userId), `SupervisorAssignment` (PK
teamId+userId). Migration `<timestamp>_teams`. Seed `src/seed/demo.ts`.

## Acceptance criteria
| ID | Given / When / Then |
| --- | --- |
| AC-03-1 | Student A1 (Team Alpha) sees exactly Team Alpha with its members; Supervisor 2 sees exactly Beta and Gamma. |
| AC-03-2 | Student A1 requesting Team Beta gets 404. |
| AC-03-3 | Supervisor 1 requesting Team Beta gets 404. |
| AC-03-4 | Running the seed twice leaves the same users, teams, memberships and supervisor assignments without duplicate rows. Persistence after an API restart is checked separately in MAN-01. |
| AC-03-5 | When Student A1 opens another team's page by URL, the page shows **Team not found** and reveals no data from that team. |
