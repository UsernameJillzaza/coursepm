# F-10 Team progress board — feature contract

Version 1.0 · 2026-11-28 · Issue: #73 (contract); implementation: S2-4 (Issue to be created) ·
Links: FR-15, NFR-02, NFR-08, NFR-10, BR-06, D-03, D-05, D-06, D-09 · Depends on: F-05, F-06,
**F-08** (`closedAt`, `originalDeadline`, `extended`)

## Purpose

A team's students and its assigned supervisors see, on one page, the state of every milestone of
that team (FR-15). From the board they can open any milestone (drill-down) or filter the board to
one state. The board is read-only. It computes the states from the stored data and never stores them.

## States (exactly one per milestone; the table is the **precedence** order, not the display order)

| # | State | Condition (server clock `now`) |
| --- | --- | --- |
| 1 | `CLOSED` | `closedAt` is set (closed early, F-08), whatever else is true |
| 2 | `FEEDBACK_GIVEN` | the **latest** revision has feedback |
| 3 | `SUBMITTED` | at least one revision exists, and the latest one has no feedback yet |
| 4 | `OVERDUE` | no revision, and `now > deadline` |
| 5 | `NOT_SUBMITTED` | no revision, and `now ≤ deadline` (inclusive deadline, D-05) |

Consequences, stated so nobody builds it differently:
- The deadline matters only when work is **missing**. A milestone with work submitted before its
  deadline stays `SUBMITTED` or `FEEDBACK_GIVEN` after the deadline.
- `deadline` is the effective deadline after any F-08 extension, so an extension moves an `OVERDUE`
  milestone back to `NOT_SUBMITTED` (D-06).
- `SUBMITTED` means **waiting for feedback**. Since CHG-01 (F-05 v1.2) it also means the team
  cannot submit the next revision until the supervisor gives feedback (409 `AWAITING_FEEDBACK`). So
  this column is where supervisor action is needed, not student action.
- Feedback on an older revision does not count. If revision 1 has feedback and revision 2 has none,
  the state is `SUBMITTED`, because the newest work is waiting for feedback.
- A milestone closed early is `CLOSED` even with feedback. Its card still shows the latest revision
  and whether it has feedback.
- "Latest revision" = the stored revision with the highest `revision` number (unique per milestone,
  BR-07). `deadline` is the stored `Milestone.deadline`, which F-08 already moves on an extension.
  `DeadlineExtension` is queried only for `originalDeadline` / `extended`, never to decide a state.
- The board `state` is **not** the milestone DTO's `status` (F-04/F-08), where `CLOSED` also means
  "deadline passed". So a milestone with no work after its deadline is `Closed` in the team list and
  `Overdue` on the board. The board page uses only `state`. The `Closed early` badge (F-08) is the
  list's equivalent of board `CLOSED`.

Rule function (pure, unit-tested): `deriveMilestoneState({ closedAt, deadline, latest, now })` in
`server/src/rules/board.ts`, where `latest` is `null` or `{ hasFeedback: boolean }`.

## Behavior and workflow

1. On `/teams/:teamId` a **Progress board** link opens `/teams/:teamId/board`. Everyone in scope sees
   it.
2. The page calls `GET /api/teams/:teamId/board`. The server checks scope (404, D-03), loads the
   team's milestones and the needed facts with a fixed number of batched queries (milestones, latest
   revision per milestone, feedback on those revisions, extensions), derives each state with `now`
   taken once per request, and returns the items and the counts.
3. The page shows five columns in the **display order** of FR-15, a constant `BOARD_COLUMNS` =
   `NOT_SUBMITTED, SUBMITTED, FEEDBACK_GIVEN, OVERDUE, CLOSED` (labels Not submitted · Submitted ·
   Feedback given · Overdue · Closed). Each column has a count. Each card
   links to `/milestones/:id`.
4. Clicking a column title filters the board to that state. The filter is kept in the URL
   (`?state=OVERDUE`), so it survives a reload and can be shared. **Show all** clears it.
5. The response carries `Cache-Control: no-store`, so a new request always reflects the latest
   submissions, feedback, extensions and closes.

**Rules and failure cases** (order: session 401 → scope 404 → query 400)

| Case | Response |
| --- | --- |
| No session | 401 `UNAUTHENTICATED` |
| Team outside the user's scope, unknown, or a malformed ID | 404 `NOT_FOUND` "Team not found." (D-03) |
| `state` that is not exactly one of the five names (wrong case, unknown, empty `?state=`, or repeated `?state=A&state=B`) | 400 `VALIDATION_ERROR` with `fields.state` "State must be one of NOT_SUBMITTED, SUBMITTED, FEEDBACK_GIVEN, OVERDUE, CLOSED." |
| Team with no milestone | 200 with `items: []` and all counts 0 |

There is no role check: any user in scope may read the board, and it has no write action.

## UI

- `/teams/:teamId/board`: the team name above the board, then five columns. A card shows:
  - the title
  - the deadline in Bangkok time, with "(extended from …)" when `extended`
  - "2 / 3 revisions"
  - the latest revision's number, submitter and time, and a "Feedback given" mark when it has feedback
- At phone width the columns stack vertically, each with its count.
- NFR-10 states:
  - Loading: the shared spinner from `components/States.tsx` (`role=status`, label "Loading")
  - Empty team: "No milestones yet."
  - A filtered state with no card: "No milestones are <state>."
  - Error: the standard alert with **Retry**
  - Out of scope (404): the same heading, paragraph and **Back to My teams** link as `TeamDetailPage`
- No create, edit or feedback controls on this page. Those stay on the milestone pages.

## API

| Method & path | Request | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/teams/:teamId/board` | optional query `state` = `NOT_SUBMITTED` \| `SUBMITTED` \| `FEEDBACK_GIVEN` \| `OVERDUE` \| `CLOSED` | 200 `{ team: { id, name }, generatedAt, counts, items }` | 400, 401, 404 |

- `counts` holds all five keys, always for the **whole** team, even when `state` filters the items.
- Each item: `{ milestoneId, title, deadline, originalDeadline, extended, closedAt, state,
  revisionsUsed, maxRevisions, latest: null | { revision, submittedAt, submittedBy: { id, name },
  hasFeedback } }`.
- Items are ordered by `deadline` ascending, then `milestoneId` ascending, the same as the milestone
  list (F-04).
- `generatedAt` is the `now` the states were derived with.

## Data

**No schema change and no migration.** The states come from `Milestone` (`deadline`, `closedAt`),
`Submission` (latest `revision`), `Feedback` (exists for that submission) and `DeadlineExtension`
(through F-08's `originalDeadline` / `extended`). Storing a state would duplicate these facts and
could drift from them, so the board never stores one.

## NFR-08 responsiveness (F-10 owns the measurement)

What this is: a **warm, in-process, small-data smoke measurement on a developer laptop**, which is what
NFR-08 asks for ("with seed data … on a developer laptop"). It is not a load test.

- **Endpoints, the full set of main list endpoints:**
  - `GET /api/teams`
  - `GET /api/teams/:teamId/milestones`
  - `GET /api/milestones/:milestoneId/submissions`
  - `GET /api/teams/:teamId/board`
  - F-08's `GET /api/milestones/:milestoneId/history`, once F-08 has merged; the run states whether it was included.
- **Who and which records:**
  - Supervisor 2 (Beta and Gamma) requests Beta, and Beta's milestone with the most revisions.
  - Student B1 requests the same records.
- **Dataset:**
  - The demo seed (3 teams), plus a fixture that **this script creates in its own setup and removes in its teardown**, so other tests still see the plain seed.
  - The fixture is 10 milestones per team covering all five states, up to 3 revisions each, feedback on about half, and 2 extensions per team.
  - The script prints the row counts.
- **Method:**
  - One Express app and one logged-in Supertest agent per user. The logins happen before timing, so the scrypt cost is not timed.
  - 5 warm-up requests, then 50 timed requests per endpoint per user.
  - p95 = nearest rank, i.e. the 48th of the 50 sorted samples. The script reports p50, p95 and the maximum.
- **Pass:** p95 < 500 ms for every endpoint and user.
- **Where it runs:** its own script, `npm --prefix server run perf:nfr08`, not the normal `npm test`, so a busy laptop cannot make the regular suite flaky. A failed run is reported as failed and may be re-run once, and both runs are kept.
- **Evidence:**
  - The output is committed to `artifacts/sprint-2/perf/nfr-08-<commit>.txt`.
  - The same script may also be pointed at the deployed candidate for Part E. That is recorded as a separate measurement, not as the NFR-08 pass.

## Acceptance criteria

| ID | Given / When / Then |
| --- | --- |
| AC-10-1 | `deriveMilestoneState` returns each of the five states for its condition. Where conditions overlap, the order in the table decides: closed + feedback → `CLOSED`; past deadline + latest without feedback → `SUBMITTED`. |
| AC-10-2 | Boundaries: no revision at `now = deadline` → `NOT_SUBMITTED`, and 1 ms later → `OVERDUE`. After an extension to a future deadline an overdue milestone is `NOT_SUBMITTED`. Feedback on revision 1 only, with revision 2 stored → `SUBMITTED`. |
| AC-10-3 | A test team supervised by Supervisor 1 with A1 as a member has six milestones: one per state, plus a second `NOT_SUBMITTED` one with the same deadline as the first. A1 and Supervisor 1 get its board → 200, with `Cache-Control: no-store`. A SUBMITTED milestone whose revision 1 has feedback and revision 2 has none shows `latest.revision` 2 with `hasFeedback` false. An extended milestone has `extended` true. Every item has the documented shape and the expected state. The counts are 2 for `NOT_SUBMITTED` and 1 for each other state, and add up to the number of items, and the items are ordered by deadline, then id. |
| AC-10-4 | Supervisor 2 and B1 asking for that test team's board, an unknown team ID, and the IDs `abc` and `0` → 404 with no data of that team. No session → 401. |
| AC-10-5 | `?state=OVERDUE` returns only overdue items while `counts` stays for the whole team. `?state=overdue` (wrong case), `?state=DONE`, an empty `?state=` or a repeated `state` → 400 `fields.state`. An out-of-scope team with an invalid `state` → 404 (scope first). A team with no milestone → 200, `items: []`, all counts 0. |
| AC-10-6 | Persistence: after a real API submission, feedback, extension and close, each followed by a new GET, the affected milestone moves `NOT_SUBMITTED` → `SUBMITTED` → `FEEDBACK_GIVEN`. A second overdue milestone moves `OVERDUE` → `NOT_SUBMITTED` after the extension, and a third moves to `CLOSED`. A second submission to the first milestone moves it back to `SUBMITTED`. |
| AC-10-7 | NFR-08: with the dataset above, the p95 of 50 requests is under 500 ms for each listed endpoint that exists at the tested commit, and the measurement file is saved. |
| AC-10-8 | UI: the five columns appear in `BOARD_COLUMNS` order with their counts, whatever order the API items come in. Each card links to its milestone. Clicking a column sets `?state=` and shows only that column, and **Show all** clears it. Loading, empty, filtered-empty, error (with **Retry**) and 404 states appear. There are no write controls, and at 375 px the columns stack without horizontal scroll. |
| AC-10-9 | End to end: a student submits, the board shows the milestone under Submitted. Supervisor 1 gives feedback, and after a reload the board shows it under Feedback given. |

## Software test specification (planned)

TEST-10-01 … TEST-10-08 and TEST-UI-10 in the Sprint 2 [sts.md](sts.md). The unit tests for
`deriveMilestoneState` (TEST-10-01, TEST-10-02) are the RED commit before the implementation, with
logs in `artifacts/sprint-2/tdd/F-10-*.txt`.

## Definition of Done

The Sprint 1 [definition-of-done.md](../sprint-1/definition-of-done.md) applies, plus:
- [ ] Built on `sprint2-staging` **after F-08 has merged** (it needs `closedAt` and the extension
      fields).
- [ ] The `perf:nfr08` script exists in `server/package.json` and is described in the README test section.
- [ ] No migration. `docs/system-sds.md` describes the board endpoint and the state precedence.
- [ ] Every AC-10-n has a passing test in the STS with file › name and the tested commit, and the
      NFR-08 measurement file names its commit. The traceability rows for FR-15 and NFR-08 are filled
      in.
- [ ] The Sprint 1 and F-08 tests still pass unchanged.
- [ ] The PR is reviewed by Jakkarin, merged into `sprint2-staging`, and the Issue moves to Done on
      board #8.
