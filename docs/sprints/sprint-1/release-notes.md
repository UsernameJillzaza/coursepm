# Sprint 1 release notes: v0.1.0

Status: **release candidate** on `sprint1-staging`. After the reviewed `sprint1-staging` → `main` release PR, tag `v0.1.0`, re-run the full suite on the tag, and record that commit here.

| Field | Value |
| --- | --- |
| Release tag / commit | `v0.1.0` / `<commit on main after the release PR>` |
| Features | F-01 authentication · F-02 access scope · F-03 teams + demo seed · F-04 milestones · F-05 submissions (deadline + revision rules) · F-06 feedback · R-01/R-02 scaffold and shared UI states |
| Pull requests | #10 (Parts A–D), #11 (Part E contracts), #12 (scaffold), #13 (F-01), #14 (F-02/F-03), #15 (F-04), #16 (F-05), #17 (F-06), the #9 PR (E2E, evidence, these notes) |
| Release candidate run | `a0ddf35` on `feature/9-e2e-release-docs`, 2026-11-15: server 111/111 · client 39/39 · E2E 3/3 (0 failed, 0 skipped) · server type-check OK · client build OK. Log: [sprint1-release-run.txt](../../../artifacts/sprint-1/test-runs/sprint1-release-run.txt) |
| Requirements | every Sprint 1 FR/BR/NFR has a feature, AC and test in [traceability](../../traceability.md); results in the STS "Execution results" section |

## Demo sequence (about 3 minutes)
Setup: `npm --prefix server run db:deploy`, then `npm --prefix server run db:seed` (8 synthetic accounts, password = your `SEED_PASSWORD`).
1. Log in as `alpha1@coursepm.test` with a wrong password: one generic alert. Log in correctly: **My teams** shows only Team Alpha.
2. Log out; log in as `supervisor1@coursepm.test` → Team Alpha → **New milestone**. A past deadline is rejected beside the field; create it with a deadline next week and a revision limit of 2.
3. Log in as `alpha1`, open the milestone. A `javascript:` link is rejected beside the field; submit with a real link (revision 1), resubmit (revision 2): the form is replaced by "All 2 revisions used."
4. Log in as `supervisor1`, save feedback on revision 1. Log in as `alpha2` and reload: feedback is on revision 1 only.
5. As `alpha1`, open Team Beta's URL: **Team not found** (the API answered 404).

## Part F screenshots (`artifacts/sprint-1/screenshots/`)
| File | Scenario | Feature / AC | Role |
| --- | --- | --- | --- |
| 01-login-invalid-credentials | wrong password → generic alert | F-01 / AC-01-2 | visitor |
| 02-student-my-teams | own team only | F-03 / AC-03-1 | Student A1 |
| 03-after-logout-redirected-to-login | logout, protected page needs login | F-01 / AC-01-4 | Student A1 |
| 04-milestone-past-deadline-rejected | rule rejection beside the field | F-04 / AC-04-4 | Supervisor 1 |
| 05-submission-link-rejected | rule rejection, values kept | F-05 / AC-05-5, AC-05-10 | Student A1 |
| 06-revision-limit-reached | limit 2 reached, form replaced | F-05 / AC-05-4, AC-05-8 | Student A1 |
| 07-supervisor-feedback-saved | feedback on revision 1 | F-06 / AC-06-1 | Supervisor 1 |
| 08-student-sees-persisted-result | retrieval after reload | F-05/F-06 / AC-05-7, AC-06-4 | Student A2 |
| 09-other-team-not-found | out-of-scope page → 404 | F-02/F-03 / AC-03-5 | Student A1 |

The forbidden **role** operations (student creates a milestone → 403, student records feedback → 403) are proven by API tests (TEST-02-04, TEST-02-05), because the UI never offers those controls; hiding a button is not authorization.

## Known limitations and incomplete work (disclosed)
- **MAN-01** (restart the API and confirm the data is still there) is a manual check still to be done on the release commit. Persistence across sessions and reloads is covered automatically (E2E-02).
- Not covered by an automated test: exhausting all 3 submission retries (409 `CONFLICT`) and a deadline passing during a retry (both need fault injection); the inclusive deadline is covered at unit level only (TEST-05-03).
- TDD evidence gaps, stated in the PRs: the scaffold's basic health/404 behaviour (#12) and the F-06 API (#17) were committed together with their tests; some 404/401 guard tests passed before their routes existed because the catch-all route already answered 404.
- One flaky client test was found by the first release run on `2e7a41d` (client 38/39): the F-06 "saving feedback refreshes the list" test held an element from before the list reloaded. `a0ddf35` makes it wait for the final state (assertions unchanged); it then passed 10/10 on its own and 4/4 in the full client suite, and in the release run above.
- Each E2E run adds a "Design review <timestamp>" milestone to Team Alpha in the development database.
- Not in Sprint 1 by design: Docker / CI / GCP (Lab 5), revision comparison, milestone editing / extensions, administration screens, progress board, scores, summary and export (Sprints 2–3).
