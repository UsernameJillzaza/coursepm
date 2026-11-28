# F-05 Submission with deadline and revision rules — feature contract

Version 1.2 · 2026-11-28 (CHG-01: resubmission needs feedback on the previous revision) · 1.1 2026-11-15 (data note updated in #7) · Issue: #2 (contract); implementation: #7; change: #74 · Links: FR-06, FR-07, FR-08, BR-06, BR-07, BR-08, NFR-05, D-01, D-05, D-06, D-08

## Behavior and workflow
1. A Student of the team opens `/milestones/:id` and fills in a title, description and link.
2. The server: scope check (404) → role must be `STUDENT` (403) → `validateSubmission()` (400) →
   inside one transaction: read the milestone, then `checkCanSubmit({ deadline, maxRevisions,
   revisionsUsed, latestHasFeedback, now })`, where `latestHasFeedback` says whether the highest stored
   revision has a feedback row (read in the same transaction).
   - `now > deadline` → 409 `DEADLINE_PASSED` (BR-06; `now == deadline` is accepted, D-05).
   - `revisionsUsed >= maxRevisions` → 409 `REVISION_LIMIT_REACHED` (BR-07).
   - `revisionsUsed >= 1` and `!latestHasFeedback` → 409 `AWAITING_FEEDBACK` (BR-07 since CHG-01),
     message "Wait for feedback on revision n before submitting again." Checked **after** the deadline
     and the limit, so a closed or used-up milestone keeps its existing message.
3. It stores the submission with `revision = nextRevision` from `checkCanSubmit`,
   `submittedById = req.user.id`, and
   `submittedAt = now` (server clock). The `UNIQUE (milestoneId, revision)` constraint makes a
   concurrent duplicate fail. On that conflict, the server retries the whole transaction for up to
   **3 attempts**, reading the current milestone, revision count and latest feedback and checking the
   deadline, limit and feedback rule again with the server clock. A loser of the race therefore gets
   409 `AWAITING_FEEDBACK` (the winner's revision has no feedback yet). If capacity remains, the next revision is stored. If the deadline,
   limit or feedback rule now rejects the request, it returns the corresponding 409. Repeated collisions through all
   attempts return 409 `CONFLICT` (NFR-05; SDS Section 1).
4. Earlier revisions are never updated or deleted; no update/delete endpoint exists.
5. The list returns revisions newest first, each with its submitter and its feedback (or `null`).

**Rule functions** — `server/src/rules/submission.ts`: `validateSubmission(input)` (title 3–120,
description ≤ 2,000, link parsed with `new URL()`, protocol `http:`/`https:`, ≤ 2,048 characters; since Lab 6
(Issue #59) the link must also contain no whitespace or control character, start with `http://` or `https://`
followed directly by a host, and have no empty host label; the check is syntactic, not DNS or host-character validation;
since Issue #63 the title rejects any control character and the description any except tab, line feed and carriage return) and
`checkCanSubmit(state)`, which returns `{ ok: true, nextRevision } | { ok: false, code }` with `code` one of
`DEADLINE_PASSED`, `REVISION_LIMIT_REACHED`, `AWAITING_FEEDBACK`; the `AWAITING_FEEDBACK` result also carries
`revision` (= n) so the route can build its message. `latestHasFeedback` is a required input. Both are pure functions,
so they are unit-tested without a database. **TDD: the unit tests for `checkCanSubmit` are committed
failing first.**

## UI
Milestone detail shows the deadline, "Revisions used: 1 / 3", and the submit form (Student only).
After the deadline or at the limit, the form is replaced by an explanation ("The deadline has passed" /
"All 3 revisions used"). Otherwise, when the milestone's `awaitingFeedback` is `true` (CHG-01), it is
replaced by "Waiting for feedback on revision n." Supervisors never see the form. A 400 response shows field-level validation messages and preserves entered
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
`<timestamp>_submission_team_matches_milestone` migration replaces the single-column milestone FK from the first
migration with the composite FK (`Milestone UNIQUE(id, teamId)` already exists from the milestones migration). All submission FKs are RESTRICT: submissions are never deleted (BR-07).

## Acceptance criteria
| ID | Given / When / Then |
| --- | --- |
| AC-05-1 | Student A1 submits to an open Alpha milestone → 201 with `revision: 1`, `submittedBy` A1, and a server-set `submittedAt`. A fresh GET returns it. |
| AC-05-2 | *(revised by CHG-01)* After Supervisor 1 records feedback on revision 1, Student A2 resubmits → `revision: 2`; revision 1 is returned unchanged. |
| AC-05-3 | For a milestone whose deadline has passed → 409 `DEADLINE_PASSED`, and the submission count doesn't change. At exactly the deadline → accepted. |
| AC-05-4 | With `maxRevisions: 2` and 2 revisions stored → 409 `REVISION_LIMIT_REACHED`, and nothing is stored. |
| AC-05-5 | Links such as `ftp://x`, `javascript:alert(1)` or `not a url`, or a title of 2 characters → 400 with the field named. |
| AC-05-6 | *(revised by CHG-01)* Two simultaneous submissions to a milestone whose latest revision has feedback (or that has none) produce exactly one new revision n + 1 and one 409 `AWAITING_FEEDBACK`; never two rows with the same revision. |
| AC-05-7 | The list shows revisions newest first, each with its submitter and its feedback (or none). |
| AC-05-8 | In the UI, the form is hidden after the deadline, at the limit, or *(CHG-01)* while the latest revision awaits feedback, and a 409 shows its message. |
| AC-05-9 | With an open milestone whose limit is 1, two concurrent submissions produce exactly one revision 1 and one 409 `REVISION_LIMIT_REACHED`; no duplicate or extra row is stored. |
| AC-05-10 | In the submission form, a 400 response shows validation messages beside the matching fields and keeps the entered values. |
| AC-05-11 | *(CHG-01)* Revision 1 exists without feedback → a student's POST returns 409 `AWAITING_FEEDBACK` and the count stays 1. After Supervisor 1 records feedback on revision 1, the same POST → 201 `revision: 2`. With feedback on revision 1 but not on revision 2, a third POST → 409 `AWAITING_FEEDBACK` (only the latest revision counts). |
| AC-05-12 | *(CHG-01, check order)* At the limit with the latest revision unreviewed → 409 `REVISION_LIMIT_REACHED`; after the deadline with the latest revision unreviewed → 409 `DEADLINE_PASSED`; an invalid body → 400 before any rule. |
| AC-05-13 | *(CHG-01)* `GET /api/milestones/:id` and the team milestone list return `awaitingFeedback: false` with no revisions or when the latest revision has feedback, and `true` otherwise; the student's milestone page then shows "Waiting for feedback on revision n." instead of the form. |
