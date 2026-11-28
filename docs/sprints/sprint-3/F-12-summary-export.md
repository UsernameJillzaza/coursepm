# F-12 Supervisor summary and CSV export — feature contract

Version 1.0 · 2026-11-28 · Issue: #73 (contract); implementation: Sprint 3, after 29 Nov (Issue to
be created) · Links: FR-17, FR-18, NFR-02, NFR-07, NFR-08, NFR-10, D-03, D-05, D-06, D-09 ·
Depends on: **F-10** (`deriveMilestoneState`, board drill-down), **F-11** (score fields in the
export), F-08 (`originalDeadline`, `closedAt`), F-09 (`RequireRole`, `NoAccess`, and the `ADMIN` access tests)

**Status:** contract only by 29 Nov (Deliverable 2 Part C). It will not be implemented before the
Sprint 2 release.

## Purpose

- **FR-17:** a Supervisor sees, on one page, how all their assigned teams are doing: on-time rate,
  overdue milestones and submissions waiting for feedback. Each number links to the team's board
  (F-10) filtered to that state.
- **FR-18:** a Supervisor downloads one team's full record (milestones, every revision, feedback and
  score) as a CSV file.

## Definitions (exact, so the numbers cannot be computed two ways)

All of these use the server clock `now`, taken once per request, and the F-10 state rules.

| Term | Definition |
| --- | --- |
| **Due milestone** | `now > originalDeadline` (the deadline before any extension, F-08), **excluding** a milestone closed early (`closedAt` set) that has no revision. The supervisor cancelled that one. |
| **On time** | A due milestone whose **revision 1** was submitted at or before `originalDeadline` (inclusive, D-05). A due milestone with no revision is not on time. Work accepted only because of an extension counts as **late**. An extension allows late work (D-06), but does not turn it into on-time work. |
| **On-time rate** | on-time ÷ due for one team. The totals row is **pooled**: the sum of on-time ÷ the sum of due, not an average of team rates. `null` when there is no due milestone. The API returns a fraction rounded half up to 4 decimals. The UI shows a whole percent rounded half up (0.125 → "13 %"), or "—" when it is null. |
| **Overdue** | F-10 state `OVERDUE`: no revision, `now > deadline` (the current, possibly extended deadline) and not closed early. |
| **Awaiting feedback** | F-10 state `SUBMITTED`: the latest revision has no feedback. A milestone closed early is not counted, because its state is `CLOSED`. "Waiting since" is that latest revision's `submittedAt`. Feedback can still be given on a milestone closed early (F-08 AC-08-8), but that work is intentionally not counted as awaiting: closing says the supervisor has finished with the milestone. |
| **Extended, nothing submitted yet** | Past `originalDeadline` but not past the extended `deadline`, with no revision. It is **due and not on time**, so it lowers the rate, but it is neither overdue (its F-10 state is `NOT_SUBMITTED`) nor awaiting feedback. This is intended: the original deadline was missed, and the extension only gives more time. |

Rule functions (pure, unit-tested) in `server/src/rules/summary.ts`:
- `isDue(m, now)` and `isOnTime(m)`, where `m` is `{ originalDeadline, deadline, closedAt, revision1SubmittedAt: Date | null, latest: null | { hasFeedback } }`. `revision1SubmittedAt` is null exactly when there is no revision.
- `summarizeTeam(milestones, now)`, with the same `m` shape → `{ milestones, due, onTime, onTimeRate, overdue, awaitingFeedback }`. It calls F-10's `deriveMilestoneState({ closedAt, deadline, latest, now })` for the overdue and awaiting counts.
- `csvCell(value, kind: 'text' | 'number' | 'time')` and `toCsv(rows)` in `server/src/rules/csv.ts` (see the export rules below).

## Behavior and workflow

### Summary (FR-17)

1. A Supervisor sees a **Summary** link in the top bar (only for `SUPERVISOR`). It opens `/summary`.
2. The page calls `GET /api/summary`. The handler checks the role inline, because there is no record to load first (`middleware.ts` deliberately has no role middleware). Order: session 401 → role 403. The server then loads the caller's assigned teams with the
   existing scope helper (`teamScopeWhere`), loads the milestones of those teams with a fixed number
   of batched queries (no query per team or milestone), and computes the numbers above.
3. The page shows:
   - a totals row
   - a table with one row per team: team, milestones, due, on-time rate, overdue, awaiting feedback
   - below the table, two lists: the overdue milestones (earliest deadline first) and the work waiting
     for feedback (waiting longest first)
4. Drill-down:
   - a team's **overdue** number links to `/teams/:teamId/board?state=OVERDUE`
   - its **awaiting feedback** number links to `?state=SUBMITTED`
   - each listed milestone links to `/milestones/:id`
   - a count of 0 is plain text, not a link, and the totals row has no links

### Export (FR-18)

1. On `/teams/:teamId` an assigned Supervisor sees an **Export CSV** button. The client fetches
   `GET /api/teams/:teamId/export.csv` with the session cookie (same origin). On 200 it saves the
   response as a file under the name from `Content-Disposition`. On an error it shows the API message
   in the standard alert, so the user never sees a raw JSON page.
2. The server checks session (401), then scope (404), then role (403), builds the CSV and returns it.
3. The file has **one row per submission revision**. A milestone with no revision gets one row with
   the submission, feedback and score columns empty. Rows are ordered by milestone deadline, then
   milestone id, then revision.

**Rules and failure cases**

| Case | Response |
| --- | --- |
| No session | 401 `UNAUTHENTICATED` (both endpoints) |
| `GET /api/summary` by a Student, or by any role other than `SUPERVISOR` (including `ADMIN` from F-09) | 403 `FORBIDDEN` "Only supervisors can view the summary." |
| Supervisor with no assigned team | 200, `teams: []`, totals all 0 and `onTimeRate` null |
| Export for a team outside the caller's scope, unknown, or a malformed ID | 404 `NOT_FOUND` "Team not found." (D-03; scope before role) |
| Export by an `ADMIN` (after F-09) | 404, because `teamScopeWhere` gives a non-student only the teams it is assigned to supervise, and an admin has none. (F-09's explicit ADMIN branch of `teamScopeWhere` matches no team.) |
| Export by a Student of that team | 403 `FORBIDDEN` "Only supervisors can export a team record." |
| Team with no milestone | 200, a CSV with the header row only |

## UI

- **`/summary`:**
  - The page title is "Summary of my teams".
  - Loading uses the shared `Loading` spinner, errors use `ErrorAlert` with **Retry** (`components/States.tsx`). The empty state ("You are not assigned to any team.") is a new shared `Empty` component added to `States.tsx` (NFR-10).
  - At phone width the table scrolls inside its own container, and the page itself does not scroll sideways.
  - F-12 reuses the `RequireRole` route guard and the shared `NoAccess` component created by F-09 (which merges first). A student who opens `/summary` directly sees `NoAccess`. The page is still protected by the API's 403.
  - The table's own horizontal scroll at phone width is a manual check (CSS), recorded with a screenshot.
- **Export CSV:**
  - The button appears on `/teams/:teamId` for supervisors only, next to **Progress board**. It is disabled while the download is running.
  - It is hidden for students, and the backend still returns 403.

## API

| Method & path | Request | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/summary` | — | 200 `{ generatedAt, totals, teams, overdue, awaitingFeedback }` | 401, 403 |
| `GET /api/teams/:teamId/export.csv` | — | 200 `text/csv` file | 401, 403, 404 |

**`GET /api/summary` response:**
- `totals` and each `teams[]` item have `{ milestones, due, onTime, onTimeRate, overdue, awaitingFeedback }`. Each team item also has `team: { id, name, courseCode }`.
- `teams` is ordered by `courseCode`, then `name`.
- `overdue[]` items are `{ teamId, teamName, milestoneId, title, deadline }`, ordered by deadline ascending, then milestoneId.
- `awaitingFeedback[]` items are `{ teamId, teamName, milestoneId, title, revision, submittedAt, submittedBy: { id, name } }`, ordered by `submittedAt` ascending (waiting longest first), then milestoneId.
- The response has the header `Cache-Control: no-store`.

**`export.csv` response:**
- **Headers:**
  - `Content-Type: text/csv; charset=utf-8`
  - `Content-Disposition: attachment; filename="coursepm-team-<teamId>-<YYYYMMDD-HHmm>.csv"`, with the time in Asia/Bangkok
  - `Cache-Control: no-store`
- **Encoding and escaping:**
  - The body starts with a UTF-8 byte-order mark, so Excel opens Thai names correctly.
  - Lines end with CRLF (RFC 4180).
  - A field containing a comma, a double quote, CR or LF is wrapped in double quotes, with inner quotes doubled.
- **CSV-injection guard (OWASP):**
  - The guard is decided **by column**, not by content. Number columns are `team_id`, `milestone_id`, `revision` and `score`. Time columns are `deadline`, `original_deadline`, `closed_early_at`, `submitted_at` and `feedback_at`. Every other column is text.
  - A **text** cell gets a leading `'` when its first character is tab or CR, or when it matches `^\s*[=+\-@]`. Some spreadsheets trim leading blanks before reading a formula, which is why the pattern allows whitespace first. So `-5 days`, `  =1+1` and `@x` are all prefixed.
  - The guard runs **before** quoting: `=1,2` becomes `"'=1,2"`.
  - The `'` stays visible in the file. It is the only change made to the stored text, and the export is a report rather than a re-import format.
  - Number, time and empty cells are never prefixed.
- **Columns, in this order** (the header row uses exactly these names):

| # | Column | Value |
| --- | --- | --- |
| 1 | `team_id` | team id |
| 2 | `team_name` | team name |
| 3 | `milestone_id` | milestone id |
| 4 | `milestone_title` | title |
| 5 | `deadline` | current deadline, ISO 8601 with `+07:00` (D-05) |
| 6 | `original_deadline` | F-08 `originalDeadline`, same format |
| 7 | `closed_early_at` | `closedAt` or empty |
| 8 | `milestone_state` | F-10 state at export time |
| 9 | `revision` | revision number, or empty |
| 10 | `submitted_at` | ISO 8601 `+07:00`, or empty |
| 11 | `submitted_by` | submitter name, or empty |
| 12 | `submission_title` | or empty |
| 13 | `submission_description` | or empty |
| 14 | `submission_link` | or empty |
| 15 | `on_time` | on each due milestone's **first row**: `yes` / `no`. A due milestone with no revision gets `no`; one closed early but still due (it has a revision) is computed normally. Empty on every other row and for milestones that are not due |
| 16 | `feedback_at` | or empty |
| 17 | `feedback_by` | supervisor name, or empty |
| 18 | `feedback_text` | or empty |
| 19 | `score` | F-11 score (0–100) for the milestone, on the milestone's **first** row only; empty if none |
| 20 | `score_released` | `yes` / `no` on the same row as `score`; empty if no score |

The export is for supervisors only, so it includes scores that have not been released yet (BR-12 limits what **students** see). Column 19–20 values follow the F-11 contract. If F-11's data model changes these, this contract is revised in the same PR.

## Data

**No schema change and no migration.** Everything is read from `Team`, `Milestone`,
`Submission`, `Feedback`, `DeadlineExtension` (F-08) and the F-11 score data. Nothing is stored.

## Acceptance criteria

| ID | Given / When / Then |
| --- | --- |
| AC-12-1 | Unit: `isDue` / `isOnTime` / `summarizeTeam`. A first revision exactly at `originalDeadline` → on time, and 1 ms later → late. A revision submitted after an extension, but before the extended deadline → late. A milestone closed early with no revision → not due. Exactly at `originalDeadline` → not yet due, and 1 ms later → due. An extended milestone with no revision past `originalDeadline` → due, not on time, not overdue. A milestone closed early that has a revision and is past `originalDeadline` → due, and on time if revision 1 was at or before `originalDeadline`. No due milestone → `onTimeRate` null. 2 of 3 on time → 0.6667, and the pooled total of 1/2 and 1/1 → 0.6667, not 0.75. |
| AC-12-2 | Supervisor 2 (Beta and Gamma) calls `GET /api/summary` on a fixture with known outcomes → 200. The per-team and total numbers equal the expected values. `teams` is ordered by course code, then name. The overdue and awaiting-feedback lists contain exactly the expected milestones in the documented order. No Alpha data appears. |
| AC-12-3 | A Student → 403. An ADMIN (after F-09) → 403 on the summary and 404 on an export. No session → 401. A supervisor with no assigned team → 200 with empty teams and `onTimeRate` null. |
| AC-12-4 | Supervisor 1 exports Alpha at a fixed server time → 200 with the documented headers, the filename carrying that time in Bangkok time. The header row has exactly the 20 columns in order. There is one row per revision, plus one row for a milestone without revisions. Values are the stored ones, with times in `+07:00`. `on_time`, `score` and `score_released` appear only on each milestone's first row. A due milestone without revisions has `on_time` = `no`. |
| AC-12-5 | Export: Supervisor 2 for Alpha, an unknown ID, `abc` → 404. Student A1 for Alpha → 403 (scope before role). No session → 401. A team with no milestone → the header row only. |
| AC-12-6 | Escaping: a feedback text with a comma, a double quote and a line break, and a Thai submitter name, round-trip unchanged through an RFC 4180 parser. The file starts with the UTF-8 BOM and lines end with CRLF. |
| AC-12-7 | CSV injection: in text columns, `=HYPERLINK("http://x")`, `+1`, `-2+3`, `-5 days`, `@x`, `  =1+1`, `=1,2`, and texts starting with a tab or CR are exported with a leading `'` (guard before quoting). Number, time and empty cells are never prefixed. |
| AC-12-8 | UI: `/summary` shows the totals and per-team rows, with the rate as a whole percent rounded half up or "—". Non-zero overdue and awaiting numbers link to the board with the matching `?state=`; zero counts and the totals row are plain text. Export CSV saves the file on 200 and shows the alert on an error. Loading, empty and error (with **Retry**) states appear. The **Summary** link and **Export CSV** button are shown to supervisors only, and a student opening `/summary` sees the no-access message. |
| AC-12-9 | NFR-08: `GET /api/summary` is added to the `perf:nfr08` endpoint list, and its p95 for Supervisor 2 is under 500 ms. |

## Software test specification (planned)

TEST-12-01 … TEST-12-08 and TEST-UI-12 in the Sprint 3 [sts.md](sts.md). Each RED test is committed
before its implementation, with logs in `artifacts/sprint-3/tdd/F-12-*.txt`.

## Definition of Done

The Sprint 1 [definition-of-done.md](../sprint-1/definition-of-done.md) applies, plus:
- [ ] Built after F-10 and F-11 have merged. The score columns follow the merged F-11 data model. The ADMIN rows of TEST-12-04 run once F-09 has merged.
- [ ] F-12 uses `RequireRole` and `NoAccess` from F-09, and adds `Empty`, with component tests (TEST-UI-12).
- [ ] F-12 only **appends** `GET /api/summary` to the `perf:nfr08` endpoint list. TEST-10-07 is unchanged, and the Sprint 3 run measures the F-10 endpoints plus the summary. The export is a download, not a list endpoint, so it is not timed.
- [ ] Manual checks MAN-12-01 (phone-width table) and MAN-12-02 (fixed number of queries, query log printed once) recorded in the STS.
- [ ] No migration. `docs/system-sds.md` describes both endpoints, and the definitions table above.
- [ ] Every AC-12-n has a passing test in the STS with file › name and the tested commit, and the
      traceability rows for FR-17 and FR-18 are filled in.
- [ ] The Sprint 1, F-08 and F-10 tests still pass unchanged.
- [ ] The PR is reviewed by Jakkarin, merged into the Sprint 3 staging branch, and the Issue moves to
      Done on board #8.
