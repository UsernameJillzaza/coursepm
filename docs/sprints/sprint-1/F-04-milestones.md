# F-04 Milestone creation and list — feature contract

Version 1.2 · 2026-11-28 (F-08, #77: `closedAt`, `originalDeadline`, `extended` and the closed-early `status`) · 1.1 2026-11-28 (CHG-01 adds `awaitingFeedback` to the milestone response) · 1.0 2026-11-15 · Issue: #2 (contract); implementation: #6 · Links: FR-04, FR-05, BR-04, BR-05, D-05

## Behavior and workflow
1. The Supervisor opens an assigned team and clicks **New milestone**.
2. They enter a title, description, deadline (local Bangkok time; the client sends ISO 8601 UTC) and a
   revision limit (default 3).
3. The server checks scope (404), then role (403), then `validateMilestone()` (400), and stores the
   milestone with `createdById`.
4. Everyone in scope lists the team's milestones ordered by deadline ascending, each with
   `revisionsUsed`, `status` (`OPEN` while `now ≤ deadline`, otherwise `CLOSED`), `latestSubmittedAt` and
   (since CHG-01) `awaitingFeedback`: `true` when at least one revision exists and the latest one has no
   feedback. It is computed on the server so the client never re-implements BR-07.

**Validation (BR-05)** — `server/src/rules/milestone.ts`, `validateMilestone(input, now)`:
title trimmed 3–120 characters; description ≤ 2,000 characters; deadline a valid date **after** `now`;
maxRevisions an integer 1–5. All failing fields are returned together in `fields`.
Since Lab 6 (Issue #63) a title with a control character, or a description with one other than tab, line feed or carriage return, is also a field error (`server/src/rules/text.ts`), so a NUL byte gets 400 instead of a 500 from the database.

## UI
The milestone list on `/teams/:teamId` uses badges `Open` / `Closed` and "2 / 3 revisions". The
**New milestone** button is shown to supervisors only (the backend still enforces it). The form at
`/teams/:teamId/milestones/new` shows field errors under each input. The page loads the team first and
names it above the form; for a team the supervisor cannot see it shows **Team not found** and no form,
and any other load error shows the standard alert with **Retry** (Lab 6, Issue #60).

## API
| Method & path | Request | Success | Errors |
| --- | --- | --- | --- |
| `POST /api/teams/:teamId/milestones` | `{ title, description, deadline, maxRevisions? }` | 201 `{ milestone }` (same derived fields; `awaitingFeedback: false`, CHG-01) | 400, 401, 403, 404 |
| `GET /api/teams/:teamId/milestones` | — | 200 `{ items: [milestone + revisionsUsed, status, latestSubmittedAt, awaitingFeedback] }` | 401, 404 |
| `GET /api/milestones/:milestoneId` | — | 200 `{ milestone (same derived fields as the list), team: {id,name} }` | 401, 404 |

## Data
`Milestone` (teamId FK, title, description, deadline timestamptz, maxRevisions int with CHECK 1–5,
createdById FK, createdAt). Migration `<timestamp>_milestones`.

### Since F-08 (#77)
- The milestone object (list, create, get, and the F-08 edit / extension / close responses) also has `closedAt` (null or a time), `originalDeadline` (the earliest extension's `previousDeadline`, otherwise equal to `deadline`) and `extended` (boolean). The list reads the extension data in one batched query over the listed IDs, like `revisionsUsed` (no N+1, NFR-08).
- `status` is also `CLOSED` after an early close: `CLOSED` when `closedAt` is set **or** `now > deadline`, otherwise `OPEN`. AC-04-5 reads with that definition.
- The list keeps the `Open` / `Closed` badge on `status` and adds `Closed early` and `Extended` badges. See [F-08](../sprint-2/F-08-milestone-maintenance.md).

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
