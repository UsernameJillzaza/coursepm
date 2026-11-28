# Sprint 3 — Software Test Specification (STS)

Version 0.1 · 2026-11-28 · Issue #73. Levels, fixtures and commands as in the
[Sprint 1 STS](../sprint-1/sts.md): **U** unit · **I** API/database integration · **C** UI
component · **E** end-to-end · **B** build/configuration. Preconditions with past deadlines,
revisions, feedback, extensions and scores are inserted directly through Prisma in the test setup.

**Status of every row: Planned.** The **Actual test** and **Result** columns are filled in from the
run on the release that contains the feature. A row only says Pass after that test has run and
passed on the named commit.

Sections are added per feature: F-11 by Jakkarin, F-12 by Achirawit.

## F-12 Supervisor summary and CSV export

| Test | AC | Lvl | Precondition / input | Action | Expected result | Actual test (file › name) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TEST-12-01 | AC-12-1 | U | now fixed; originalDeadline O | `isOnTime` with first revision at O, O + 1 ms, and after an extension but before the new deadline; `isDue` at now = O and O + 1 ms; closed early with no revision; extended with no revision, now past O but before the new deadline; closed early with revision 1 at O, now past O | on time, late, late; not due, due; not due; due and not on time; due and on time | — | Planned |
| TEST-12-02 | AC-12-1 | U | — | `summarizeTeam` with 0 due milestones; with 3 due (2 on time); with one overdue and one awaiting feedback; with a milestone closed early that has an unanswered revision; an extended milestone with no revision; pooled totals of teams with 1/2 and 1/1 | `onTimeRate` null; 0.6667; overdue 1, awaitingFeedback 1; the closed one counted in neither; the extended one due, not on time, in neither list; total 0.6667 (not 0.75) | — | Planned |
| TEST-12-03 | AC-12-2 | I | Fixture for Beta and Gamma with known outcomes (on time, late after extension, overdue, awaiting feedback, closed early); Alpha with milestones too | `GET /api/summary` as Supervisor 2 | 200 with `Cache-Control: no-store`; per-team and total numbers equal the expected values; `teams` ordered by course code, then name; `overdue` and `awaitingFeedback` lists exact and in the documented order; no Alpha id or title in the body | — | Planned |
| TEST-12-04 | AC-12-3 | I | A1; an ADMIN user (after F-09); a supervisor created with no assignment; no cookie | `GET /api/summary` as each; the ADMIN also exports Alpha | 403, 403, 200 (`teams: []`, totals 0, `onTimeRate` null), 401; ADMIN export 404 | — | Planned |
| TEST-12-05 | AC-12-4 | I | Alpha with milestone M1 (original deadline 2026-11-25, revision 1 before it, revision 2 after an extension, feedback on 1, a released score), M2 (deadline 2026-11-26, no revision), M3 (deadline 2026-11-27, its only revision after an extension, unreleased score); server clock fixed at 2026-12-01T05:30:00Z | `GET /api/teams/{alpha}/export.csv` as Supervisor 1, then parse it | 200; `text/csv; charset=utf-8`; filename `coursepm-team-<alphaId>-20261201-1230.csv` (Bangkok time); `no-store`; exact 20-column header; rows M1 r1, M1 r2, M2 (empty submission columns), M3 r1, in that order; times end with `+07:00`; `on_time` / `score` / `score_released` only on each milestone's first row; `on_time`: M1 `yes`, M2 `no`, M3 `no` (late via extension); M3 `score_released` = `no` | — | Planned |
| TEST-12-06 | AC-12-5 | I | Alpha; Gamma with no milestone | Export Alpha as Supervisor 2, unknown ID, `abc` and as A1; with no cookie; export Gamma as Supervisor 2 | 404 ×3; 403; 401; Gamma 200 with the header row only | — | Planned |
| TEST-12-07 | AC-12-6, AC-12-7 | U + I | CSV writer; a revision by a student named "นักศึกษา ทดสอบ", title `=HYPERLINK("http://x")`, descriptions `+1`, `-2+3`, `-5 days`, `  =1+1`, `=1,2`, link starting `@`, feedback `a, "b"` + line break, feedbacks starting with a tab and with CR; a score of 0 and revision 1 | Unit: `csvCell` per kind and `toCsv`; API: export and parse with an RFC 4180 parser | BOM first; CRLF line ends; text round-trips unchanged except a leading `'` on every listed `=`/`+`/`-`/`@`/whitespace-then-`=`/tab/CR cell; `=1,2` written as `"'=1,2"` (guard then quote); number, time and empty cells unprefixed | — | Planned |
| TEST-12-08 | AC-12-9 | I | The `perf:nfr08` dataset | Run `npm --prefix server run perf:nfr08` with `GET /api/summary` appended to the list (TEST-10-07 itself unchanged), as Supervisor 2 | p95 < 500 ms; included in `artifacts/sprint-3/perf/nfr-08-<commit>.txt` | — | Planned |
| TEST-UI-12 | AC-12-8 | C | Summary page with a mocked response (one team with a null rate, one with rate 0.125, one with 0 overdue), pending, empty and failed responses; team page as supervisor and as student, with mocked export 200 and 403; `/summary` as a student | Render; click an overdue number; click **Retry**; click Export CSV | Totals and rows; "—" and "13 %"; non-zero counts link to `/teams/:id/board?state=OVERDUE` / `SUBMITTED`, zero and totals are plain text; `Loading` / `Empty` / `ErrorAlert` states; Summary link and Export CSV only for the supervisor; export 200 triggers a file save and the button is disabled while it runs, 403 shows the alert; `RequireRole` shows `NoAccess` with its link to My teams to the student | — | Planned |

### Manual checks (F-12)

| Check | AC / DoD | Method | Expected | Evidence | Result |
| --- | --- | --- | --- | --- | --- |
| MAN-12-01 | AC-12-8 | Open `/summary` as Supervisor 2 at 375 px width | The table scrolls inside its container; the page has no horizontal scroll | screenshot in `artifacts/sprint-3/screenshots/` | Planned |
| MAN-12-02 | DoD | Call `GET /api/summary` once with Prisma query logging on, with the NFR-08 dataset and again with one team only | The same number of queries in both runs (no query per team or milestone) | the two query logs in `artifacts/sprint-3/` | Planned |
