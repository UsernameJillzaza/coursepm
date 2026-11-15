# F-04 Milestone creation and list — feature contract

Version 1.0 · 2026-11-15 · Issue: #2 (contract); implementation: #6 · Links: FR-04, FR-05, BR-04, BR-05, D-05

## Behavior and workflow
1. The Supervisor opens an assigned team and clicks **New milestone**.
2. They enter a title, description, deadline (local Bangkok time; the client sends ISO 8601 UTC) and a
   revision limit (default 3).
3. The server checks scope (404), then role (403), then `validateMilestone()` (400), and stores the
   milestone with `createdById`.
4. Everyone in scope lists the team's milestones ordered by deadline ascending, each with
   `revisionsUsed`, `status` (`OPEN` while `now ≤ deadline`, otherwise `CLOSED`) and `latestSubmittedAt`.

**Validation (BR-05)** — `server/src/rules/milestone.ts`, `validateMilestone(input, now)`:
title trimmed 3–120 characters; description ≤ 2,000 characters; deadline a valid date **after** `now`;
maxRevisions an integer 1–5. All failing fields are returned together in `fields`.

## UI
The milestone list on `/teams/:teamId` uses badges `Open` / `Closed` and "2 / 3 revisions". The
**New milestone** button is shown to supervisors only (the backend still enforces it). The form at
`/teams/:teamId/milestones/new` shows field errors under each input.

## API
| Method & path | Request | Success | Errors |
| --- | --- | --- | --- |
| `POST /api/teams/:teamId/milestones` | `{ title, description, deadline, maxRevisions? }` | 201 `{ milestone }` | 400, 401, 403, 404 |
| `GET /api/teams/:teamId/milestones` | — | 200 `{ items: [milestone + revisionsUsed, status, latestSubmittedAt] }` | 401, 404 |
| `GET /api/milestones/:milestoneId` | — | 200 `{ milestone, team: {id,name} }` | 401, 404 |

## Data
`Milestone` (teamId FK, title, description, deadline timestamptz, maxRevisions int with CHECK 1–5,
createdById FK, createdAt). Migration `<timestamp>_milestones`.

## Acceptance criteria
| ID | Given / When / Then |
| --- | --- |
| AC-04-1 | Supervisor 1 creates "Proposal" for Team Alpha with a future deadline → 201. It is listed for Supervisor 1 and for Alpha's students. |
| AC-04-2 | A student calling the create endpoint for their own team → 403; the milestone count doesn't change. |
| AC-04-3 | Supervisor 1 creating for Team Beta (not assigned) → 404; nothing is stored. |
| AC-04-4 | A title of 2 or 121 characters, a past deadline, or maxRevisions 0 or 6 → 400 with each failing field named. A title of 3 or 120 characters and maxRevisions 1 or 5 are accepted. |
| AC-04-5 | The list is ordered by deadline and shows `revisionsUsed` and `status`. |
| AC-04-6 | In the UI form, a 400 response shows the message under the matching field and keeps the typed values. |
| AC-04-7 | A Student viewing their own team does not see the **New milestone** control. The API restriction remains covered by AC-04-2. |
