# Sprint 2 — Software Test Specification (STS)

Version 0.1 · 2026-11-28 · Issue #73. Levels, fixtures and commands are the same as in the
[Sprint 1 STS](../sprint-1/sts.md): **U** unit · **I** API/database integration · **C** UI
component · **E** end-to-end · **B** build/configuration. Milestones with a past deadline and
submissions used as preconditions are inserted directly through Prisma in the test setup.

**Status of every row: Planned.** The **Actual test** and **Result** columns are filled in from the
Sprint 2 release run. A row only says Pass when that test has actually run and passed on the named
commit.

Sections are added per feature as each contract is written: F-07 and F-09 by Jakkarin, F-08 and F-10
by Achirawit.

## F-08 Milestone maintenance and deadline extension

| Test | AC | Lvl | Precondition / input | Action | Expected result | Actual test (file › name) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TEST-08-01 | AC-08-1 | I | Supervisor 1; open Alpha milestone, no submission or extension | PATCH description + deadline (+3 d); then PATCH with a changed description and the unchanged deadline | 200 both; GET returns the new values; history has 2 `EDIT` rows, then 1 more (field, old, new, Supervisor 1, time) | — | Planned |
| TEST-08-02 | AC-08-2 | I | Three Alpha milestones: one with a submission, one with an extension, one with a past deadline (inserted directly); a fourth with deadline D and a fixed server clock | PATCH description, and PATCH deadline, on the first three; PATCH description on the fourth at now = D and at D + 1 ms | 409 `MILESTONE_HAS_SUBMISSIONS` / `MILESTONE_EXTENDED` / `DEADLINE_PASSED`, milestone and `MilestoneChange` count unchanged; fourth: 200 at D, 409 `DEADLINE_PASSED` at D + 1 ms | — | Planned |
| TEST-08-03 | AC-08-3 | U | now and stored values fixed | `validateMilestoneEdit`: past deadline; deadline without timezone; description 2,000 / 2,001 / empty; body with `title`; with `maxRevisions`; description with a NUL; values equal to stored; same deadline instant in another offset; empty body; body with only unknown keys | fields for past, no-timezone, 2,001, NUL, title, maxRevisions; `noChange` for equal values, the same instant, the empty body and unknown-only keys; 2,000 and empty description accepted | — | Planned |
| TEST-08-04 | AC-08-3 | I | Supervisor 1 | PATCH with a past deadline and a 2,001-char description; PATCH with the stored values | 400 `VALIDATION_ERROR` with `fields.deadline` + `fields.description`; then 400 `NO_CHANGE` with no `fields`; nothing stored | — | Planned |
| TEST-08-05 | AC-08-4 | I | A1 (Alpha); Supervisor 2 (not Alpha) | PATCH, POST extensions and POST close on an Alpha milestone as each user; Supervisor 1 on IDs `abc` and `0` | A1 → 403 ×3; Supervisor 2 → 404 ×3; malformed IDs → 404; no rows stored | — | Planned |
| TEST-08-06 | AC-08-5 | I | Supervisor 1; Alpha milestone with deadline D | POST extension D+2 d with reason "Server outage"; then a second one to D+3 d | 201 with the `extension` shape; `deadline` D+2 d, `originalDeadline` D, `extended` true. Second: `previousDeadline` D+2 d, `originalDeadline` still D, 2 rows | — | Planned |
| TEST-08-07 | AC-08-6 | U | now fixed | `validateExtension`: newDeadline in the past, malformed, without timezone, now + 1 ms; reason missing / 2 / 3 / 500 / 501 chars / containing NUL | Errors for past, malformed, no-timezone, missing, 2, 501, NUL; accepted for now + 1 ms, 3, 500 | — | Planned |
| TEST-08-08 | AC-08-6 | I | Supervisor 1; milestone with future deadline D, and one with past deadline P | Extend the first to D and D − 1 ms, and to D + 1 ms; extend the second to a time between P and now | 400 `fields.newDeadline` for D, D − 1 ms and the P..now value; 201 for D + 1 ms | — | Planned |
| TEST-08-09 | AC-08-7 | I | Alpha milestone with a past deadline, 1 of 3 revisions used | A1 submits; Supervisor 1 extends by +1 d; A1 submits again | First 409 `DEADLINE_PASSED`; then 201 revision 2 | — | Planned |
| TEST-08-10 | AC-08-8 | I | Open Alpha milestone with revision 1; a second one with maxRevisions 1 and 1 revision used | Supervisor 1 closes the first; A1 submits; Supervisor 1 closes, edits and extends it again with **valid** payloads (future dates, valid reason); Supervisor 1 posts feedback on revision 1; close the second, A1 submits to it; close a third milestone with a 501-char reason and with a NUL in the reason | close 200 and `status` CLOSED; submit 409 `MILESTONE_CLOSED`, count unchanged; the three repeats 409 `MILESTONE_CLOSED`; feedback 201; second: 409 `MILESTONE_CLOSED`, not `REVISION_LIMIT_REACHED`; 501-char and NUL reasons → 400 `fields.reason` | — | Planned |
| TEST-08-11 | AC-08-9 | I | Test DB | Insert directly through Prisma: an extension with `newDeadline` = `previousDeadline`; one with a 2-char reason | Each rejected by a CHECK; no row | — | Planned |
| TEST-08-12 | AC-08-10 | I | Milestone with one edit, one extension, then a close | GET history as A1, Supervisor 1 and Supervisor 2 | A1 and Supervisor 1: 200 with [CLOSE, EXTENSION, EDIT] in the documented shape (ISO deadlines, reason, who/when); Supervisor 2: 404 | — | Planned |
| TEST-08-13 | AC-08-11 (a) | I | Open Alpha milestone, no submission, limit 3; repeated 20 times on fresh milestones | `Promise.all`: PATCH deadline and A1 submit | Each run: if both succeed, the edit's `changedAt` < the submission's `submittedAt`; if the edit gets 409 `MILESTONE_HAS_SUBMISSIONS`, exactly one submission exists; no other outcome | — | Planned |
| TEST-08-14 | AC-08-8 | U | — | `checkCanSubmit` with `closedAt` set: (a) future deadline, (b) past deadline and limit reached; and without `closedAt` | (a) and (b) → `MILESTONE_CLOSED` (closed is checked first); without `closedAt` the Sprint 1 results are unchanged | — | Planned |
| TEST-08-15 | AC-08-1, AC-08-5, AC-08-8 | E | Seeded Supervisor 1 and A1 | In the UI, Supervisor 1 edits, then extends a demo milestone, and closes another one; A1 opens them | A1 sees "extended from …", the `Extended` and `Closed early` badges and the history; screenshots in `artifacts/sprint-2/screenshots/` | — | Planned |
| TEST-08-16 | AC-08-9 | I | Test DB | Insert directly: a `MilestoneChange` EDIT with null `field`; EDIT with `field` = `title`; EDIT with null `newValue`; EDIT with a non-null `reason`; CLOSE with `field` = `deadline`; CLOSE with an `oldValue`; one with a 501-char reason; update a Milestone to `closedAt` set and `closedById` null | Each rejected by a CHECK | — | Planned |
| TEST-08-17 | AC-08-11 (b) | I | Supervisor 1; milestone with deadline D | `Promise.all`: two extensions to D+1 d | Exactly one 201 and one 400 `fields.newDeadline`; one `DeadlineExtension` row; `deadline` = D+1 d | — | Planned |
| TEST-08-18 | AC-08-10 | U | — | History merge function with an EDIT, an EXTENSION and a CLOSE sharing one `at`, plus older items | Ordered by `at` desc, then CLOSE, EXTENSION, EDIT, then id desc within the same kind | — | Planned |
| TEST-UI-08 | AC-08-12 | C | Milestone page props: supervisor inside / outside the edit window; closed early; extended; student; mocked 400 on edit and on extension; mocked `NO_CHANGE`; mocked 409 | Render; submit both forms; open Close and press Cancel | Edit only inside the window; no controls for students or after a close; badges shown in the header and the team list; field errors under inputs with values kept; `NO_CHANGE`/409 in the alert; Cancel sends no request | — | Planned |

**Regression kept green:** TEST-04-*, TEST-05-* and TEST-06-* from Sprint 1 run unchanged. A change
to their expectations has to be a reviewed contract revision, not a test edit.
