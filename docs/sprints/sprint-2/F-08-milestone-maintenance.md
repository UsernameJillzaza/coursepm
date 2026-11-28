# F-08 Milestone maintenance and deadline extension — feature contract

Version 1.1 · 2026-11-28 (implementation notes: two migrations, Issue #77) · 1.0 2026-11-28 · Issue: #73 (contract); implementation: #77 ·
Links: FR-12, FR-13, BR-04, BR-05, BR-06, BR-07, BR-11, D-03, D-05, D-06, D-09, NFR-02, NFR-05, NFR-08

## Purpose

FR-12 and FR-13 look alike once a milestone belongs to exactly one team: both can move a deadline.
D-09 keeps them as **separate, separately audited actions**, so the only way to accept late work is
an extension with a reason (D-06):

| | FR-12 **edit** | FR-12 **close early** | FR-13 **extension** |
| --- | --- | --- | --- |
| Meaning | correct a mistake before anything has happened | stop accepting work now | give this team more time |
| Allowed when | not closed early, **deadline not yet passed, no extension, no submission** | not already closed early | not closed early; before **or after** the deadline |
| Deadline may move | earlier or later, still in the future (BR-05) | — | **later only** (BR-11), and into the future |
| Reason | not required | optional (≤ 500 characters, no control characters other than tab / line feed / carriage return) | **required** (3–500 characters) |
| Recorded in | `MilestoneChange` kind `EDIT`, one row per changed field (old → new) | `MilestoneChange` kind `CLOSE` | `DeadlineExtension` (previous → new deadline) |
| Original deadline | replaced (nothing has happened against it yet) | kept | **kept visible** (`originalDeadline`) |

The edit window uses the inclusive deadline of D-05: an edit at exactly the deadline is still allowed, and 1 ms later gets 409 `DEADLINE_PASSED`. Because an edit is impossible after the deadline or after an extension, an edit can never re-open
a missed deadline or undo an extension. That keeps `originalDeadline` consistent with the history.

## Behavior and workflow

1. An assigned Supervisor opens a milestone (`/milestones/:id`). The page shows **Edit** (only
   inside the edit window above), **Grant extension** and **Close milestone**.
2. **Edit:** the form is pre-filled with the description and deadline, and the client sends the
   form values. In one transaction the server locks the milestone row (`SELECT … FOR UPDATE`),
   checks the state, computes the changed fields with `validateMilestoneEdit`, updates the
   milestone and writes one `MilestoneChange` row per changed field. A field that was sent but did
   not change is skipped. A deadline is unchanged when it is the same instant.
3. **Grant extension:** the Supervisor enters a new deadline (Bangkok time, sent as ISO 8601 UTC,
   D-05) and a reason. In one transaction the server locks the row, checks the state, compares the
   new deadline with the locked row's deadline, stores a `DeadlineExtension` row with
   `previousDeadline` = the locked row's deadline, and sets `Milestone.deadline` to the new value.
4. **Close milestone:** after a confirmation dialog, the server locks the row, checks the state,
   sets `closedAt` / `closedById` and writes a `MilestoneChange` row of kind `CLOSE` with the
   optional reason. Re-opening is not offered.
5. Everyone in scope (the team's students and its assigned supervisors) sees the current deadline,
   the original deadline when it was extended, the closed-early state and the history list
   (`GET /api/milestones/:id/history`).

### Check order (all three write actions)

scope 404 → role 403 → **request shape 400** (types, lengths, control characters, ISO format,
"new deadline in the future", forbidden fields) → lock row → **state 409** → **relative check 400**
(compared with the locked row) → write.

| Step | Edit | Extension | Close |
| --- | --- | --- | --- |
| state 409, in this order | `MILESTONE_CLOSED` → `DEADLINE_PASSED` → `MILESTONE_EXTENDED` → `MILESTONE_HAS_SUBMISSIONS` | `MILESTONE_CLOSED` | `MILESTONE_CLOSED` |
| relative 400 | `NO_CHANGE` (nothing differs from the stored values) | `fields.newDeadline` when `newDeadline ≤` current deadline (BR-11) | — |

So a closed milestone always answers 409 `MILESTONE_CLOSED`, even when its other fields are also
wrong relative to the stored values. A shape error (400) still comes before any state check, as in
F-05. The second of two concurrent extensions waits for the lock and is then compared with the first
one's new deadline: it gets 201 if it is still later, otherwise 400 `fields.newDeadline`.

### Rule functions (pure, unit-tested)

- `validateMilestoneEdit(body, now, stored: { description, deadline })` in
  `server/src/rules/milestone.ts` → `{ ok: true, changes: { description?, deadline? } }` |
  `{ ok: false, fields }` | `{ ok: false, noChange: true }`. It reuses the BR-05 field rules:
  description ≤ 2,000 characters (an empty description is allowed, as at creation), no control
  characters, and a deadline with a timezone that is after `now`. `title` or `maxRevisions` in the
  body → `fields.title` "Title cannot be changed after creation." /
  `fields.maxRevisions` "The revision limit cannot be changed after creation.". Other unknown keys are
  ignored. An empty body, or one with only unknown keys, gives `noChange`. `validateMilestone` (creation) is not changed.
- `validateExtension(body, now)` in `server/src/rules/milestone.ts` → `{ ok, value: { newDeadline,
  reason } }` | `{ ok: false, fields }`: `newDeadline` ISO 8601 with a timezone and after `now`;
  `reason` trimmed 3–500 characters with no control characters other than tab, line feed and
  carriage return (`text.ts`). The comparison with the current deadline happens after the lock.
- `checkCanSubmit` (F-05) gains an **optional** `closedAt?: Date | null` in `SubmitState` and
  `MILESTONE_CLOSED` in the `SubmitCheck` code union. **Combined rule order of `checkCanSubmit`** (the one place it is written for Sprint 2): closed
  (`MILESTONE_CLOSED`, F-08) → deadline (`DEADLINE_PASSED`, BR-06) → revision limit
  (`REVISION_LIMIT_REACHED`, BR-07) → feedback on the latest revision (`AWAITING_FEEDBACK`, CHG-01,
  F-05 v1.2). Each later check runs only when the earlier ones pass.
  The Sprint 1 unit tests call it without `closedAt` and stay unchanged. `RULE_MESSAGES.MILESTONE_CLOSED`
  = "This milestone has been closed by the supervisor."

### Effects on other features

- **F-05 submissions:** BR-06 already reads `Milestone.deadline`, so an extension re-opens
  submission without changing the deadline rule. `trySubmit` takes the same row lock as its first
  statement, before `submission.count`. Each retry after a `P2002` is a new transaction and takes the
  lock again. The F-05 contract gets a note about `MILESTONE_CLOSED` and the lock.
- **F-04 list / detail:** the DTO changes as described under API. The F-04 contract's `status`
  sentence and AC-04-5 get a note that `status` is also `CLOSED` after an early close.
- **F-06 feedback:** unchanged. Feedback on existing revisions is still allowed after a close.
- **F-10 board** (contract to be written in #73): uses `closedAt` to tell *Closed* from *Overdue*.
- **Lab 7 change CHG-01** (Issue #74, F-05 v1.2): revision n + 1 is accepted only when revision n
  has feedback. It adds the last step of the combined order above. An extension re-opens the
  deadline, but it does **not** bypass the feedback rule, and a close still wins over everything.
  That is why AC-08-7 / TEST-08-09 give feedback on revision 1 before the late revision 2. F-08 does
  not change BR-05 (the 24 h minimum notice was dropped and is not part of any contract).

## UI

- `/milestones/:id`, supervisor view: **Edit**, **Grant extension** and **Close milestone**. **Edit**
  is shown only inside the edit window (open, deadline not passed, not extended, no submission). All
  three are hidden once the milestone is closed early, and they are never shown to students. The
  backend still enforces every rule.
- Edit form: Description, Deadline. Extension form: New deadline (the current deadline is shown
  next to it), Reason. A 400 with `fields` shows each message under its field and keeps the typed
  values. A field-less 400 (`NO_CHANGE`) or a 409 shows its message in the standard alert.
- Close: a confirmation dialog, "Students can no longer submit to this milestone. This cannot be
  undone.", with an optional reason and **Close milestone** / **Cancel** buttons.
- Badges, wherever milestones are shown (`/teams/:teamId` list, milestone header):
  - The existing `Open` / `Closed` badge keeps following `status`, so the Sprint 1 behaviour is
    unchanged.
  - **New:** a `Closed early` badge when `closedAt` is set; in the header it reads "Closed early by
    Supervisor 1 on 28 Nov 18:00".
  - **New:** an `Extended` badge when `extended` is true; in the header it reads "Deadline 12 Dec
    18:00 (extended from 10 Dec 18:00)".
- **History** section (everyone in scope): one line per entry with who, when, what (old → new) and
  the reason. Empty state: "No changes since the milestone was created."

## API

| Method & path | Request | Success | Errors |
| --- | --- | --- | --- |
| `PATCH /api/milestones/:milestoneId` | `{ description?, deadline? }` | 200 `{ milestone }` | 400, 401, 403, 404, 409 |
| `POST /api/milestones/:milestoneId/extensions` | `{ newDeadline, reason }` | 201 `{ extension, milestone }` | 400, 401, 403, 404, 409 |
| `POST /api/milestones/:milestoneId/close` | `{ reason? }` | 200 `{ milestone }` | 400, 401, 403, 404, 409 |
| `GET /api/milestones/:milestoneId/history` | — | 200 `{ items: [historyItem] }` | 401, 404 |

- **Errors** use the standard shape from `http.ts`:
  - field errors → 400 `VALIDATION_ERROR` "Please correct the highlighted fields." with `fields`
  - `NO_CHANGE` → 400 "Nothing to change." with no `fields`
  - state → 409 with the codes above
  - The 409 messages are:
    - `MILESTONE_CLOSED`: "This milestone has been closed by the supervisor."
    - `DEADLINE_PASSED`: "The deadline has passed; grant an extension instead." The code is shared with the F-05 submit rule, but the message differs because it applies to a different action.
    - `MILESTONE_EXTENDED`: "This milestone has an extension; grant another extension instead."
    - `MILESTONE_HAS_SUBMISSIONS`: "This milestone already has a submission; grant an extension instead."
- **`extension`**: `{ id, milestoneId, previousDeadline, newDeadline, reason, grantedBy: { id, name }, grantedAt }`.
- **`historyItem`**: `{ kind, field, oldValue, newValue, reason, by: { id, name }, at }`.
  - `EDIT`: `field` is `description` or `deadline`, `oldValue`/`newValue` are strings (a deadline as ISO 8601 UTC), `reason` null.
  - `EXTENSION`: `field` `deadline`, `oldValue` = previous deadline, `newValue` = new deadline (ISO 8601 UTC), with the reason.
  - `CLOSE`: `field`, `oldValue` and `newValue` null, `reason` or null.
  - Order: `at` descending, then `CLOSE` before `EXTENSION` before `EDIT`, then id descending within the same kind.
- **`milestone` DTO**, in list, create (201), get, PATCH, close and the extension response:
  - It gains `closedAt` (null or a time), `originalDeadline` (the earliest extension's `previousDeadline`, otherwise equal to `deadline`) and `extended` (boolean).
  - `status` is `CLOSED` when `closedAt` is set **or** `now > deadline`, otherwise `OPEN`.
  - For the list, the extension data comes from **one batched query** over the listed milestone IDs, like `submissionStats`, so there is no N+1 (NFR-08).

## Data (additive only — the tagged Lab 6 revision shares the database)

- `Milestone`: add `closedAt Timestamptz?` and `closedById Int?` (FK `User`).
  - CHECK `(closedAt IS NULL) = (closedById IS NULL)`.
  - Nothing is renamed or dropped, and `deadline` stays the effective deadline.
- `MilestoneChange` (new):
  - Columns: `id`, `milestoneId` FK, `kind` (new enum `MilestoneChangeKind`: `EDIT`, `CLOSE`), `field` text?, `oldValue` text?, `newValue` text?, `reason` text?, `changedById` FK, `changedAt` timestamptz (set from the app clock inside the transaction, after the lock, the same clock as `Submission.submittedAt`).
  - CHECKs: `kind = 'EDIT'` ⇒ `field IN ('description','deadline')` and `oldValue`, `newValue` NOT NULL and `reason` NULL; `kind = 'CLOSE'` ⇒ `field`, `oldValue`, `newValue` NULL; `reason` length ≤ 500.
  - Index `(milestoneId, changedAt)`.
- `DeadlineExtension` (new):
  - Columns: `id`, `milestoneId` FK, `previousDeadline`, `newDeadline` (timestamptz), `reason` text, `grantedById` FK, `grantedAt` timestamptz (app clock inside the transaction, after the lock).
  - CHECKs: **`newDeadline > previousDeadline`** (BR-11 in the database) and `char_length(reason)` 3–500.
  - Index `(milestoneId, grantedAt)`.
- **Enforced in code only**, under the row lock and covered by tests:
  - `Milestone.deadline` equals the latest extension's `newDeadline`.
  - Each extension's `previousDeadline` equals the deadline before it.
  - No submission is accepted after a close.
  - `MilestoneChange` and `DeadlineExtension` rows are never updated or deleted (no API does so), the same as `Submission` today.
- **Migration:** `20261128154000_milestone_maintenance` (tables, columns, indexes and CHECKs), plus `20261128154001_milestone_change_field_not_null`, which replaces `MilestoneChange_kind_check`. The first version let an EDIT row with a null `field` through, because `"field" IN (...)` is NULL when `field` is NULL and PostgreSQL accepts a CHECK that evaluates to NULL. TEST-08-16 found it (`artifacts/sprint-2/tdd/F-08-red.txt` → fix `f178d55`). It is a second migration rather than an edit of the first, because the first was already applied to the local databases. Migration order = merge order. S2-2 (#82, `20261128132923_admin_role`) merged first, so both F-08 folders were renamed after `sprint2-staging` was merged in (from `20261128124227_…` / `20261128151322_…`; the branch logs in `artifacts/sprint-2/tdd/` written before the rename keep the old names).
- **Known limit:** the tagged Lab 6 revision (`lab6-v021`) does not know `closedAt`, so through its URL a milestone closed early would still accept a submission. It is only a grading copy. Our tests and demonstrations use the current revision.

**Files expected to change:**
- `server/prisma/schema.prisma` + migration
- `server/src/rules/milestone.ts`, `server/src/rules/submission.ts`
- `server/src/milestones/routes.ts`, `server/src/submissions/routes.ts`
- the client milestone page, list and API helpers
- the F-04 and F-05 contracts (notes), `docs/system-sds.md` (data model)
- `docs/traceability.md` (AC-08 / TEST-08 rows, added in the S2-0 traceability commit)

## Acceptance criteria

| ID | Given / When / Then |
| --- | --- |
| AC-08-1 | Supervisor 1 edits the description and deadline of an open Alpha milestone (no submission, no extension) → 200. A new GET shows the new values, and the history has two `EDIT` rows with the old and new values, Supervisor 1 and the time. Sending one changed and one unchanged field writes one row. |
| AC-08-2 | An edit (description or deadline) on a milestone that has a submission → 409 `MILESTONE_HAS_SUBMISSIONS`. After an extension → 409 `MILESTONE_EXTENDED`. 1 ms after its deadline → 409 `DEADLINE_PASSED`; exactly at the deadline the edit is still accepted (D-05). In each case the milestone and the history are unchanged. |
| AC-08-3 | An edit with a past deadline, a deadline without a timezone, a description of 2,001 characters, or `title` / `maxRevisions` in the body → 400 naming each failing field. Values equal to the stored ones, an empty body, or a body with only unknown keys → 400 `NO_CHANGE`. A description containing a NUL → 400 `fields.description`. Nothing is stored. A description of exactly 2,000 characters, or an empty one, is accepted. |
| AC-08-4 | Student A1 calls edit, extension and close on their own team's milestone → 403 each. Supervisor 2 (not assigned to Alpha) → 404 each. A malformed ID (`abc`, `0`) → 404. Nothing is stored. |
| AC-08-5 | Supervisor 1 grants an extension to a later deadline with the reason "Server outage" → 201 with the `extension` shape. `deadline` is the new value, `originalDeadline` is the old one, `extended` is true. A second extension stores `previousDeadline` = the first one's `newDeadline`, and `originalDeadline` stays the first value. |
| AC-08-6 | With the current deadline D in the future, an extension to D or D − 1 ms → 400 `fields.newDeadline`, and D + 1 ms is accepted (BR-11 boundary). With D in the past, a new deadline between D and now → 400 `fields.newDeadline`, because it is not in the future. A malformed date → 400. A reason that is missing, 2 or 501 characters, or contains a NUL → 400 `fields.reason`. Lengths 3 and 500 are accepted. |
| AC-08-7 | A milestone whose deadline has passed, with revision 1 already given feedback (student submit → 409 `DEADLINE_PASSED`), gets an extension. A1 then submits → 201 with the next revision number (D-06: late work only through an extension). |
| AC-08-8 | Supervisor 1 closes a milestone that is still open → 200, `closedAt` is set and `status` is `CLOSED`. A1 then submits → 409 `MILESTONE_CLOSED`, even if the revision limit is also reached, and nothing is stored. Close, edit or extension on it again → 409 `MILESTONE_CLOSED`. A close reason of 501 characters, or one containing a NUL → 400 `fields.reason`. Feedback on an existing revision is still accepted. |
| AC-08-9 | The database rejects, when inserted directly without the API: a `DeadlineExtension` with `newDeadline ≤ previousDeadline` or a 2-character reason; a `MilestoneChange` of kind `EDIT` with a null or unknown `field`, a null value or a non-null `reason`, and one of kind `CLOSE` with a `field` or a value; and a `Milestone` with `closedAt` set but `closedById` null. |
| AC-08-10 | `GET …/history` returns `EDIT`, `EXTENSION` and `CLOSE` entries in the documented order and shape to A1 and to Supervisor 1. Supervisor 2 gets 404. |
| AC-08-11 | Races: (a) an edit and a student submission sent at the same moment never both succeed in the wrong order. If both succeed, the edit's `changedAt` is before the submission's `submittedAt`. If the edit gets 409 `MILESTONE_HAS_SUBMISSIONS`, the submission was stored. (b) Two extensions to the same new deadline at the same moment → exactly one 201 and one 400 `fields.newDeadline`, with one row. |
| AC-08-12 | UI (supervisor): an edit or extension 400 shows each message under its field and keeps the typed values. `NO_CHANGE` and 409 show the alert. **Edit** is hidden outside the edit window. Close asks for confirmation, and **Cancel** sends nothing. Students see none of the controls, and do see the `Closed early` and `Extended` badges in the header and the team list. |

## Software test specification (planned)

TEST-08-01 … TEST-08-18 and TEST-UI-08 in the Sprint 2 [sts.md](sts.md), with levels, inputs and
expected results. Each RED test is committed before its implementation. Logs go in
`artifacts/sprint-2/tdd/F-08-*.txt`.

## Definition of Done

The Sprint 1 [definition-of-done.md](../sprint-1/definition-of-done.md) applies, plus:
- [ ] The migration is additive only. After `prisma migrate deploy` on a copy of the Lab 6
      database, the `a342ed5` code still passes its health check, login and milestone list.
- [ ] Every CHECK listed under Data is in the migration SQL and covered by AC-08-9.
- [ ] Every AC-08-n has a passing test in the STS, with file › name and the tested commit. The
      traceability rows are filled in.
- [ ] The F-04 and F-05 contract notes are written. The Sprint 1 tests (TEST-04-*, TEST-05-*,
      TEST-06-*) still pass without their expectations being changed.
- [ ] The PR is reviewed by Jakkarin and merged into `sprint2-staging`, and the Issue moves to Done
      on board #8.
