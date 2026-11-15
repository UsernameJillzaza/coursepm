# F-05 Submission with deadline and revision rules — feature contract

Version 1.0 · 2026-11-15 · Issue: #2 (contract); implementation: #7 · Links: FR-06, FR-07, FR-08, BR-06, BR-07, BR-08, NFR-05, D-05, D-06, D-08

## Behavior and workflow
1. A Student of the team opens `/milestones/:id` and fills in a title, description and link.
2. The server: scope check (404) → role must be `STUDENT` (403) → `validateSubmission()` (400) →
   inside one transaction: read the milestone, then `checkCanSubmit({ deadline, maxRevisions,
   revisionsUsed, now })`.
   - `now > deadline` → 409 `DEADLINE_PASSED` (BR-06; `now == deadline` is accepted, D-05).
   - `revisionsUsed >= maxRevisions` → 409 `REVISION_LIMIT_REACHED` (BR-07).
3. It stores the submission with `revision = nextRevision` from `checkCanSubmit`,
   `submittedById = req.user.id`, and
   `submittedAt = now` (server clock). The `UNIQUE (milestoneId, revision)` constraint makes a
   concurrent duplicate fail. On that conflict, the server retries the whole transaction for up to
   **3 attempts**, reading the current milestone and revision count and checking the deadline and limit
   again with the server clock. If capacity remains, the next revision is stored. If the deadline or
   limit now rejects the request, it returns the corresponding 409. Repeated collisions through all
   attempts return 409 `CONFLICT` (NFR-05; SDS Section 1).
4. Earlier revisions are never updated or deleted; no update/delete endpoint exists.
5. The list returns revisions newest first, each with its submitter and its feedback (or `null`).

**Rule functions** — `server/src/rules/submission.ts`: `validateSubmission(input)` (title 3–120,
description ≤ 2,000, link parsed with `new URL()`, protocol `http:`/`https:`, ≤ 2,048 characters) and
`checkCanSubmit(state)`, which returns `{ ok: true, nextRevision } | { ok: false, code }`. Both are pure functions,
so they are unit-tested without a database. **TDD: the unit tests for `checkCanSubmit` are committed
failing first.**

## UI
Milestone detail shows the deadline, "Revisions used: 1 / 3", and the submit form (Student only).
After the deadline or at the limit, the form is replaced by an explanation ("The deadline has passed" /
"All 3 revisions used"). A 400 response shows field-level validation messages and preserves entered
values. A 409 from the server shows the rule message, because the UI state may be out of date.

## API
| Method & path | Request | Success | Errors |
| --- | --- | --- | --- |
| `POST /api/milestones/:milestoneId/submissions` | `{ title, description, link }` | 201 `{ submission: { id, revision, title, description, link, submittedAt, submittedBy:{id,name} } }` | 400, 401, 403, 404, 409 |
| `GET /api/milestones/:milestoneId/submissions` | — | 200 `{ items: [submission + feedback \| null] }` newest first | 401, 404 |

## Data
`Submission` (milestoneId, teamId, revision int, title, description, link, submittedById FK,
submittedAt) with `UNIQUE(milestoneId, revision)` and the composite FK
`(milestoneId, teamId) → Milestone(id, teamId)`. Migration `<timestamp>_submissions` creates the
submission table and `UNIQUE(milestoneId, revision)`; a separate
`<timestamp>_submission_team_matches_milestone` migration adds `Milestone UNIQUE(id, teamId)` and the
composite FK.

## Acceptance criteria
| ID | Given / When / Then |
| --- | --- |
| AC-05-1 | Student A1 submits to an open Alpha milestone → 201 with `revision: 1`, `submittedBy` A1, and a server-set `submittedAt`. A fresh GET returns it. |
| AC-05-2 | Student A2 resubmits → `revision: 2`; revision 1 is returned unchanged. |
| AC-05-3 | For a milestone whose deadline has passed → 409 `DEADLINE_PASSED`, and the submission count doesn't change. At exactly the deadline → accepted. |
| AC-05-4 | With `maxRevisions: 2` and 2 revisions stored → 409 `REVISION_LIMIT_REACHED`, and nothing is stored. |
| AC-05-5 | Links such as `ftp://x`, `javascript:alert(1)` or `not a url`, or a title of 2 characters → 400 with the field named. |
| AC-05-6 | Two simultaneous submissions to the same milestone produce revisions 1 and 2; never two rows with the same revision. |
| AC-05-7 | The list shows revisions newest first, each with its submitter and its feedback (or none). |
| AC-05-8 | In the UI, the form is hidden after the deadline or at the limit, and a 409 shows its message. |
| AC-05-9 | With an open milestone whose limit is 1, two concurrent submissions produce exactly one revision 1 and one 409 `REVISION_LIMIT_REACHED`; no duplicate or extra row is stored. |
| AC-05-10 | In the submission form, a 400 response shows validation messages beside the matching fields and keeps the entered values. |
