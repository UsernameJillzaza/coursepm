# Lab 7 — Change request CHG-01: resubmit only after feedback

Version 1.0 · 2026-11-28 · Issue: #74 · Status: **proposed, waiting for team approval**

| Field | Value |
| --- | --- |
| Change ID | CHG-01 |
| Type | Adaptive/perfective maintenance: a requirement change to correct, accepted Sprint 1 behavior (not a defect fix) |
| Requested by | Team TH-042_P6, acting as the course stakeholder (see Approval) |
| Affected requirements | FR-07, BR-07 (changed) · FR-06, FR-09, BR-06, BR-10 (read, unchanged) |
| Affected features | F-05 (changed rule), F-04 (milestone response gains one derived field), F-06 (feedback now unlocks the next revision; no code change), F-10 Sprint 2 (state meaning, no code change) |
| Accepted Sprint 1 baseline (old behavior) | `v0.2.1` = `main` `a342ed5`, Cloud Run `coursepm-00008-j5m` — the release Team GG EZ accepted in Lab 6 (`UAT-20261125-GGEZ-R2`) |
| Pre-change implementation | `sprint2-staging` `36787ae` (PR #72, documents only — the F-05 code is byte-identical to `a342ed5`) |
| Approval | No instructor/TA approval is required (course announcement "Lab 7 Spec Sheet Change", 2026-11-28). The team approves: Jakkarin (`jakkarin-promsee`) comments "Approved for Lab 7" on Issue #74, dated by GitHub. |

## 1. Old rule and new rule

**Old (BR-07 v0.1, F-05 v1.1, AC-05-2/AC-05-4/AC-05-6).** A team may submit revision *n + 1* at any
time before the deadline as long as the revision limit is not reached, whether or not the supervisor has
given feedback on revision *n*.

**New (BR-07 v0.2).** Revision 1 is accepted as before. Revision *n + 1* (n ≥ 1) is accepted **only if
revision n already has feedback**. Otherwise the server answers `409 AWAITING_FEEDBACK` with the message
"Wait for feedback on revision n before submitting again." and stores nothing.

**Reason.** The stakeholder dispute D-01 names "silent resubmission": a team uploads several revisions in
a row, the supervisor reviews an outdated one, and the feedback no longer matches the work. Requiring
feedback between revisions makes each revision an answer to the previous feedback, and makes the
revision limit mean "feedback rounds" rather than "uploads".

## 2. Exact behavior, boundaries and invalid cases

Check order on `POST /api/milestones/:milestoneId/submissions` (steps 1–6 unchanged, new step 7):

1. session (401) → 2. scope (404) → 3. role `STUDENT` (403) → 4. fields (400) → inside one transaction:
5. deadline `now > deadline` → 409 `DEADLINE_PASSED` → 6. limit `revisionsUsed >= maxRevisions` →
409 `REVISION_LIMIT_REACHED` → 7. **new:** `revisionsUsed >= 1` and the latest revision has no feedback →
409 `AWAITING_FEEDBACK`. `checkCanSubmit` returns `{ ok: false, code: 'AWAITING_FEEDBACK', revision: n }`
(n = `revisionsUsed`), and the static `RULE_MESSAGES` map in `server/src/submissions/routes.ts` becomes a
function of the check result so the message can name revision n. `SubmitState.latestHasFeedback` is a
**required** field, so the type-checker finds every caller that has to decide it.

| Case | Input state | Expected |
| --- | --- | --- |
| Boundary: first submission | 0 revisions | 201 revision 1 (no feedback needed) |
| Boundary: second, no feedback | revision 1, no feedback | 409 `AWAITING_FEEDBACK`, count stays 1 |
| Boundary: second, feedback given | revision 1 with feedback | 201 revision 2 |
| Only the **latest** revision counts | rev 1 with feedback, rev 2 without | 409 `AWAITING_FEEDBACK` (rev 1's feedback does not unlock rev 3) |
| Order: limit before feedback | `maxRevisions` 2, 2 revisions, rev 2 without feedback | 409 `REVISION_LIMIT_REACHED` (not AWAITING_FEEDBACK) |
| Order: deadline before feedback | deadline passed, rev 1 without feedback | 409 `DEADLINE_PASSED` |
| Order: fields before rules | invalid link, rev 1 without feedback | 400 `VALIDATION_ERROR` |
| Concurrency | latest revision has feedback (or none exists); two students POST at once | exactly one 201 (revision n + 1) and one 409 `AWAITING_FEEDBACK`; never two rows with the same revision |
| Race with feedback | feedback is saved while a submission is in flight | the submission sees either "no feedback" (409, the student retries) or "feedback" (201). Feedback is never deleted, so no inconsistent state is possible |

**Access (unchanged).** Only students of the team submit; supervisors get 403 and outsiders 404 before any
rule is evaluated, so `AWAITING_FEEDBACK` never reveals another team's state. Only an assigned supervisor
can create the feedback that unlocks the next revision (BR-09).

**UI.** `GET /api/milestones/:id` and the team milestone list gain `awaitingFeedback: boolean`, computed on
the server (`revisionsUsed >= 1` and the latest revision has no feedback). The student's form is replaced
by "Waiting for feedback on revision n." when it is true, after the existing deadline and limit messages,
in the same order as the server. A 409 `AWAITING_FEEDBACK` still shows its message if the page was stale.

**Out of scope.** No change to the deadline rule (BR-06), the limit range (BR-05), numbering, feedback
rules (BR-09/BR-10), supervisors, or the Sprint 2 extension rule (BR-11). Supervisors cannot "skip"
feedback; giving feedback is the only unlock.

## 3. Impact trace

| Req | Feature | SRS | Feature SDS | System SDS | AC | STS tests | Code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BR-07 | F-05 | BR-07 rewritten; D-01 cross-ref | `F-05-submissions.md` v1.2: workflow step 2, UI, API errors | §1 rule checks + concurrency paragraph; §4 error table (`AWAITING_FEEDBACK`) | AC-05-4 kept; **new AC-05-11, AC-05-12** | TEST-05-05 revised; **new TEST-05-11, TEST-05-12** | `server/src/rules/submission.ts` `checkCanSubmit` (+`latestHasFeedback`), `RULE_MESSAGES` |
| FR-07 | F-05 | FR-07: "after feedback on the previous revision" | same | — | **AC-05-2 revised** | TEST-05-02 revised | `server/src/submissions/routes.ts`: `trySubmit` (one attempt; reads the latest revision's feedback inside its transaction) and `RULE_MESSAGES` → message function |
| NFR-05 | F-05 | — | step 3 retry text | §1 concurrency | **AC-05-6 revised**; AC-05-9 unchanged | TEST-05-08 revised; TEST-05-10 unchanged | retry loop in the POST handler `submissionsRouter.post` (routes.ts ~l. 80–87, unchanged; each retry calls `trySubmit`, which now re-checks feedback too) |
| FR-06 (display) | F-04, F-05 | — | `F-04-milestones.md` API: `awaitingFeedback`; F-05 UI | — (the F-04 contract owns the response shape) | **AC-05-8 extended**, new AC-05-13 | TEST-UI-02 + new case; new TEST-05-12 checks the field | `server/src/milestones/routes.ts` `toMilestoneDto` (list, detail **and the 201 of POST create**, which returns `awaitingFeedback: false`), `client/src/milestones/types.ts`, `client/src/submissions/SubmitForm.tsx` (the gate), `client/src/milestones/MilestonePage.tsx` (passes the milestone to the form; no logic change expected) |
| FR-09 / BR-09 | F-06 | — | `F-06-feedback.md` v1.1: note "feedback unlocks the next revision" | — | AC-06-1…6 unchanged | TEST-06-04 unchanged (already gives feedback before revision 2) | none |
| FR-15 | F-10 (Sprint 2, contract in #73) | — | `SUBMITTED` = "latest revision has no feedback" — now also means "team waits"; no rule change | — | — | — | none (F-10 not merged yet) |
| E2E | F-04…F-06 | — | — | — | evidence for AC-05-2, AC-05-11 | **E2E-02 revised**: revision 1 → feedback → revision 2 → limit | `e2e/sprint-1/e2e-02-03-journey.spec.ts` |
| FR-07 wording elsewhere | — | `srs.md` §2 Student role row ("submit and resubmit … before the deadline") | — | §5 permission table row "Submit / resubmit" | — | — | `features.md` F-05 row: "enforces the deadline, revision limit and feedback-before-resubmission" |

**Not applicable, with reason.**

- **Persistence / migration:** none. Feedback already references exactly one submission
  (`Feedback.submissionId UNIQUE`), so "latest revision has feedback" is a query, not a new column.
- **Historical data:** existing milestones may already hold revision 2 without feedback on revision 1.
  Nothing is edited or deleted (BR-07). The new rule looks only at the latest revision when the *next*
  submission arrives, so old revisions made under the old rule stay valid and simply coexist with the
  new rule: such a milestone answers `AWAITING_FEEDBACK` until its latest revision gets feedback. The seed (`server/prisma/seed.ts`) creates no submissions.
- **Roles/ownership:** unchanged; the new check runs after scope and role.
- **Authentication, teams, milestone creation (F-01…F-04 rules):** not touched.
- **Lab 6 regression tests** (`server/tests/lab-06/`): each stores at most one revision per milestone,
  so they run unchanged.

## 4. Behavior that must stay unchanged, and the tests that guard it

| Preserved behavior | Guarding tests |
| --- | --- |
| Deadline is inclusive and server-timed | TEST-05-03, TEST-05-04 |
| Revisions numbered 1, 2, 3 … with no gaps; never edited | TEST-05-02 (revised), TEST-05-08 (revised), TEST-05-10, DB `UNIQUE(milestoneId, revision)` |
| Revision limit | TEST-05-05, TEST-05-06 (now with feedback between revisions), TEST-05-10 |
| Validation and Lab 6 fixes | TEST-05-07, TEST-L6-59-01/02, TEST-L6-63-01/02 |
| Scope 404 / role 403 before rules | TEST-02-02, TEST-02-03, TEST-02-05, the check-order test in `submissions.api.test.ts` |
| Feedback rules and placement | TEST-06-01…06 |
| Whole journey in the browser | E2E-01, E2E-02 (revised), E2E-03 |
| Lab 5 live check (limit 1, second POST → `REVISION_LIMIT_REACHED`, `docs/labs/lab-05/deployment.md` step 4) | still true, because the limit is checked before feedback (AC-05-12); repeated as a post-deploy check |
| Deploy smoke test, CI workflows, `scripts/` | contain no submission calls → no change (checked 2026-11-28) |

**Historical documents are not edited:** `docs/sprints/sprint-1/release-notes.md` (the v0.1.0 demo
"resubmit (revision 2)") and `docs/labs/lab-05/` / `lab-06/` describe released versions and stay as
records; the CHG-01 release notes say the demo now needs feedback between revisions.

## 5. Tests whose expected result legitimately changes

| Test | Old expectation (v1.0) | New expectation (v1.1) | Why |
| --- | --- | --- | --- |
| TEST-05-02 | rev 1, then rev 2 → 201 | rev 1 → feedback → rev 2 → 201 (rev 1 unchanged) | rev 2 without feedback is now invalid |
| TEST-05-05 | `checkCanSubmit` with revisionsUsed 0, 1, 2 (limit 2) → ok, ok, LIMIT | same, with `latestHasFeedback: true` for 1 and 2 | isolates the limit rule from the new rule |
| TEST-05-06 | two POSTs, third → LIMIT | POST, feedback, POST, third (rev 2 without feedback) → LIMIT | also proves limit is checked before feedback |
| TEST-05-08 | two concurrent POSTs → revisions 1 and 2 | → one 201 revision 1, one 409 `AWAITING_FEEDBACK`; then with feedback on rev 1, two concurrent → one 201 revision 2, one 409 | the requirement now forbids two revisions without feedback |
| TEST-05-09 | rev 1, rev 2, list | rev 1, feedback, rev 2, list (rev 2 `feedback: null`, rev 1 with feedback) | same reason |
| E2E-02 | rev 1, rev 2, then feedback on rev 1 | rev 1, "Waiting for feedback" visible, feedback, rev 2, limit | same reason |
| `submission-rules.unit.test.ts` `state()` helper (TEST-05-03, the "deadline first" case) | builds `SubmitState` without the new field | passes `latestHasFeedback` explicitly; **expectations unchanged** | the field is required (type-check) |
| `submissions.api.test.ts` "list and detail report revisionsUsed and latestSubmittedAt" | `revisionsUsed: 1` | also `awaitingFeedback: true` after one unreviewed revision | covers AC-05-13 on the list and detail |
| TEST-04-01 (`milestones.api.test.ts`) | 201 shape via `toMatchObject` | also `awaitingFeedback: false` on create | the shared DTO gains a field |
| Client fixtures: `submissions-ui.test.tsx` (milestone fixture; the AC-05-1 case mocks `revisionsUsed: 1`), `milestones-ui.test.tsx`, `feedback-ui.test.tsx` | `Milestone` objects without the field | add `awaitingFeedback` (`false` where the form must show; the AC-05-1 "after submit" mock becomes `true`, matching the real server) | keeps the mocks equal to the real API; expectations otherwise unchanged |
| `feedback.api.test.ts` › "TEST-06-04 / TEST-05-09" | gives feedback before revision 2 | unchanged; still carries TEST-05-09 | already follows the new rule |

No other test is removed, weakened or skipped.

## 6. Delivery sequence

1. This document + revised SRS / F-04 / F-05 / F-06 / System SDS / STS / traceability → PR A into
   `sprint2-staging`, reviewed by Jakkarin **before** any code changes.
2. Branch `maintenance/74-feedback-gate` from `sprint2-staging` after PR A merges.
3. `test:` commit — the revised and new tests, run against the unchanged code → RED (assertion failures,
   `artifacts/lab-07/tdd/red.log`), pushed alone so CI records the failing run.
4. `feat:` server rule → `feat:` `awaitingFeedback` + UI → `test:` E2E-02 → GREEN logs.
5. Regression: server, client, type-check, build, E2E; PR B review; merge; release to `main`; deploy;
   post-deploy checks (changed rule + a preserved scope/role path).
