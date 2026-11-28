# CoursePM — Requirements traceability

Version 0.1 · 2026-11-15. Requirement → feature → sprint → acceptance criteria → planned tests.
AC and TEST IDs for Sprint 1 are defined in [sprints/sprint-1/](sprints/sprint-1/). Later-sprint rows
have a feature and sprint now; their AC and tests are written when that sprint's contract is prepared.
Sprint 2 and 3 rows for F-08, F-10 and F-12 were filled on 2026-11-28 (Issue #73) from
[sprints/sprint-2/sts.md](sprints/sprint-2/sts.md) and [sprints/sprint-3/sts.md](sprints/sprint-3/sts.md).
**Planned (not run)** means the test is specified but has not been executed; it never counts as covered.
The F-07, F-09 and F-11 rows were filled the same day with their contracts (Issue #73).
The **Result** column is filled from the release-candidate run on `daefdff` (Part F); a row passes when every planned test that carries one of its IDs passed. Commands: `npm --prefix server test`, `npm --prefix client test`, `npx tsc --noEmit` (server), `npm --prefix client run build`, `npx playwright test`. Counts: server 112/112 passed, 0 failed, 0 skipped · client 39/39 passed, 0 failed, 0 skipped · E2E 3/3 passed, 0 failed, 0 skipped · type-check OK · client build OK. Lab 6 regression tests (`TEST-L6-*`) were added after that run; their results come from the Issue #57 run on `257a152` (server 141/141, client 41/41, 0 failed, 0 skipped); for `TEST-L6-60-*`, the Issue #60 run after merging `lab6-staging` into its branch (server 141/141, client 44/44, 0 failed, 0 skipped; `60-regression-after-merge.txt`); for `TEST-L6-58-*`, the Issue #58 run after merging `lab6-staging` into its branch (server 149/149, client 44/44, 0 failed, 0 skipped; `58-regression-after-merge.txt`); for `TEST-L6-59-*`, the Issue #59 run on `684c806` (server 170/170, client 44/44, 0 failed, 0 skipped; `59-regression.txt`); and, for `TEST-L6-63-*`, the Issue #63 run on `7409b18` (server 185/185, client 44/44, 0 failed, 0 skipped; `63-regression.txt`); logs in `artifacts/lab-06/tdd/`.

| Requirement | Feature / responsibility | Sprint | AC | Planned tests | Result |
| --- | --- | --- | --- | --- | --- |
| FR-01 | F-01 | 1 | AC-01-1, AC-01-2 | TEST-01-01, TEST-01-02, TEST-01-03, E2E-01, TEST-L6-58-01, TEST-L6-58-02 | Pass (6/6 tests) |
| FR-02 | F-01 | 1 | AC-01-3, AC-01-4 | TEST-01-04, TEST-01-05, E2E-01 | Pass (3/3 tests) |
| BR-01 | F-01 | 1 | AC-01-6 | TEST-01-08 | Pass (1/1 tests) |
| NFR-01 | F-01, F-02, R-01 | 1 | AC-R01-1, AC-02-1, AC-02-7, AC-01-9 | TEST-R01-01, TEST-02-01, TEST-UI-03, TEST-01-11 | Pass (4/4 tests) |
| NFR-03 | F-01 | 1 | AC-01-5 | TEST-01-06, TEST-01-07, TEST-01-12 | Pass (3/3 tests) |
| NFR-04 | F-01 | 1 | AC-01-4, AC-01-7, AC-01-8, AC-01-11 | TEST-01-05, TEST-01-09, TEST-01-10, TEST-01-13, MAN-02 cookie-flag check | Pass (4/4 tests); MAN-02 Pass on v0.1.0 |
| BR-02 | F-02, F-03 | 1 | AC-02-2, AC-02-9, AC-03-2, AC-03-5 | TEST-02-02, TEST-02-09, TEST-03-02, E2E-03, TEST-L6-57-03, TEST-L6-60-01 | Pass (6/6 tests) |
| BR-03 | F-02, F-03 | 1 | AC-02-3, AC-03-3 | TEST-02-03, TEST-03-03, TEST-L6-57-02 | Pass (3/3 tests) |
| NFR-02 | F-02 | 1 | AC-02-2 … AC-02-5, AC-02-9 | TEST-02-02 … TEST-02-05, TEST-02-09, TEST-L6-57-01 … TEST-L6-57-03 | Pass (8/8 tests) |
| NFR-07 | F-02, R-01 | 1 | AC-02-6, AC-02-8, AC-R01-3 | TEST-02-06, TEST-02-07, TEST-02-08, TEST-R01-03 | Pass (4/4 tests) |
| FR-03 | F-03 | 1 | AC-03-1 | TEST-03-01, E2E-01 | Pass (2/2 tests) |
| NFR-06 | F-03, R-01 | 1 | AC-03-4, AC-R01-2 | TEST-03-04, TEST-R01-02, MAN-01 restart check | Pass (2/2 tests); MAN-01 Pass on v0.1.0 |
| FR-04 | F-04 | 1 | AC-04-1 | TEST-04-01, E2E-02, TEST-L6-60-02 | Pass (3/3 tests) |
| BR-04 | F-04 | 1 | AC-04-2, AC-04-3, AC-04-7 | TEST-04-02, TEST-04-03, E2E-03, TEST-L6-60-01 | Pass (4/4 tests) |
| BR-05 | F-04 | 1 | AC-04-4 | TEST-04-04, TEST-04-05, TEST-L6-63-01, TEST-L6-63-02 | Pass (4/4 tests) |
| FR-05 | F-04 | 1 | AC-04-5 | TEST-04-06 | Pass (1/1 tests) |
| FR-06 | F-05 | 1 | AC-05-1 | TEST-05-01, E2E-02 | Pass (2/2 tests) |
| FR-07 | F-05 | 1 (changed by CHG-01) | AC-05-2, AC-05-11 | TEST-05-02, TEST-05-12, E2E-02 | Pass (3/3 tests) on `7efaf4e` |
| FR-08 | F-05, F-04 | 1 | AC-05-7, AC-05-13 | TEST-05-09, TEST-05-12, TEST-UI-02, E2E-02 | Pass (4/4 tests) on `7efaf4e` |
| BR-06 | F-05 | 1 | AC-05-3 | TEST-05-03, TEST-05-04 | Pass (2/2 tests) |
| BR-07 | F-05, F-06 | 1 (changed by CHG-01) | AC-05-4, AC-05-11, AC-05-12 | TEST-05-05, TEST-05-06, TEST-05-11, TEST-05-12, TEST-05-13 | Pass (5/5 tests) on `7efaf4e` |
| BR-08 | F-05 | 1 | AC-05-5 | TEST-05-07, TEST-L6-59-01, TEST-L6-59-02, TEST-L6-63-01, TEST-L6-63-02 | Pass (5/5 tests) |
| NFR-05 | F-05, F-08 | 1 | AC-05-6 (revised by CHG-01), AC-05-9; F-08 AC-08-11 | TEST-05-08, TEST-05-10; TEST-08-13, TEST-08-17 (F-08 races under the milestone row lock) | Pass (4/4 tests) on `0c28fce` (TEST-05-08, TEST-05-10, TEST-08-13, TEST-08-17) |
| FR-09 | F-06 | 1 | AC-06-1 | TEST-06-01, E2E-02 | Pass (2/2 tests) |
| FR-10 | F-06 | 1 | AC-06-4 | TEST-06-04, E2E-02 | Pass (2/2 tests) |
| BR-09 | F-06 | 1 | AC-06-2, AC-06-3 | TEST-06-02, TEST-06-03 | Pass (2/2 tests) |
| BR-10 | F-06 | 1 | AC-06-5 | TEST-06-05, TEST-06-06, TEST-L6-63-01, TEST-L6-63-02 | Pass (4/4 tests) |
| NFR-10 | R-02 | 1 | AC-R02-1, AC-01-10, AC-02-10, AC-04-6, AC-05-8 (revised by CHG-01), AC-05-13, AC-05-10, AC-06-6 | TEST-R02-01, TEST-UI-05, TEST-UI-04, TEST-UI-01, TEST-UI-02, TEST-UI-07, TEST-UI-06, TEST-L6-60-03 | Pass (8/8 tests); TEST-UI-02 re-run on `7efaf4e` |
| FR-11 | F-07 | 2 | AC-07-1 … AC-07-9 | TEST-07-01 … TEST-07-08, TEST-UI-07H | Pass on `e30dc3a` (8/9 tests; TEST-07-08 E2E not run yet) |
| FR-12 | F-08 | 2 | AC-08-1, AC-08-2, AC-08-3, AC-08-8, AC-08-10, AC-08-11, AC-08-12 | TEST-08-01 … TEST-08-04, TEST-08-10, TEST-08-12, TEST-08-13, TEST-08-14, TEST-08-15, TEST-08-18, TEST-UI-08 | Pass on `0c28fce` (integrated head, Issue #77 / PR #85), incl. TEST-08-15 (E2E) |
| FR-13, BR-11 | F-08 (D-06, D-09) | 2 | AC-08-5, AC-08-6, AC-08-7, AC-08-9, AC-08-11 | TEST-08-06 … TEST-08-09, TEST-08-11, TEST-08-15, TEST-08-16, TEST-08-17, TEST-08-19 | Pass on `0c28fce` (integrated head, Issue #77 / PR #85), incl. TEST-08-15 (E2E) |
| FR-14 | F-09 | 2 | AC-09-1 … AC-09-12 | TEST-09-01 … TEST-09-14, TEST-UI-09 | Pass on `c2acd7f` (14/15 tests); TEST-09-14 F-07 and F-08 blocks Pass on `0c28fce`, F-10 block Pass on `401ba6a`, F-11 block not run yet |
| BR-01 (`ADMIN`, Sprint 2) | F-09 | 2 | AC-09-1, AC-09-2, AC-09-6, AC-09-9 | TEST-09-01, TEST-09-02, TEST-09-07, TEST-09-08, TEST-09-12 | Pass on `c2acd7f` (5/5 tests) |
| NFR-04 (deactivation by an admin) | F-09 | 2 | AC-09-7 | TEST-09-09 | Pass on `c2acd7f` (1/1 tests) |
| FR-15 | F-10 | 2 | AC-10-1 … AC-10-6, AC-10-8, AC-10-9 | TEST-10-01 … TEST-10-06, TEST-10-08, TEST-UI-10 | Pass on `401ba6a` (8/8 tests, Issue #80 branch run), incl. TEST-10-08 (E2E) |
| NFR-08 | F-10 (measurement owner), F-12 | 2; summary endpoint added in 3 | AC-10-7, AC-12-9 | TEST-10-07 (`perf:nfr08`), TEST-12-08 | TEST-10-07 Pass on `aab45b2` (every p95 < 500 ms, max p95 11.6 ms, `history` included; `artifacts/sprint-2/perf/nfr-08-aab45b2.txt`); TEST-12-08 Planned (not run) |
| NFR-02 (Sprint 2–3 access paths) | F-07, F-08, F-09, F-10, F-11, F-12 | 2, 3 | AC-07-5, AC-07-6, AC-08-4, AC-08-10, AC-09-2, AC-09-9, AC-09-12, AC-10-4, AC-11-2, AC-11-6, AC-12-3, AC-12-5 | TEST-07-06, TEST-07-07, TEST-08-05, TEST-08-12, TEST-09-02, TEST-09-12, TEST-09-14, TEST-10-04, TEST-11-05, TEST-11-08, TEST-12-04, TEST-12-06 | Planned (not run) |
| NFR-10 (Sprint 2–3 screens) | F-07, F-08, F-09, F-10, F-11, F-12 | 2, 3 | AC-07-7, AC-07-8, AC-08-12, AC-09-11, AC-10-8, AC-11-10, AC-12-8 | TEST-UI-07H, TEST-UI-08, TEST-UI-09, TEST-UI-10, TEST-UI-11, TEST-UI-12, MAN-12-01 | Planned (not run) |
| NFR-09 | R-01, #24, #25, #27, #29 | 2 (Lab 5) | Lab 5 C-03 (fresh clone + `.env.example` → `docker compose up --build` → sign in); readiness probe; graceful shutdown; C-06 release from `main` by pipeline with the running commit visible | TEST-L5-01 … TEST-L5-11, MAN-L5-C03 Cloud Shell run, MAN-L5-C04 live journey, MAN-L5-C05 persistence and rollback | Container part Pass (server 119/119; MAN-L5-C03 Pass on `6d7a685`, stop check on `f7cbfff`); Cloud SQL part Pass (#27 live at `de9213e`, `/api/ready` `db: connected`); C-06 Pass (first automated release `a36ed20`, run 44611810394, revision `coursepm-00002-xvc`, release commit in the served bundle); C-04 and C-05 Pass on 2026-11-20 (live journey with a BR-07 server rejection; record kept through restart, redeploy, rollback and roll forward) |
| FR-16, BR-12 | F-11 (D-10) | 3; implemented for Deliverable 2 | AC-11-1 … AC-11-10 | TEST-11-01 … TEST-11-11, TEST-UI-11 | Planned (not run) |
| FR-17 | F-12 | 3 | AC-12-1, AC-12-2, AC-12-3, AC-12-8, AC-12-9 | TEST-12-01 … TEST-12-04, TEST-12-08, TEST-UI-12, MAN-12-01, MAN-12-02 | Planned (not run); contract only by 29 Nov |
| FR-18 | F-12 (score columns depend on F-11) | 3 | AC-12-4 … AC-12-7 | TEST-12-05, TEST-12-06, TEST-12-07, TEST-UI-12 | Planned (not run); contract only by 29 Nov |

## Coverage gaps and approved changes

- **Uncovered requirements:** none unmapped. Every FR, BR and NFR maps to a feature or responsibility. Sprint 2 and 3 rows are **Planned (not run)** unless they say Pass. F-07's FR-11 row was run in Issue #79 and F-09's rows (FR-14, BR-01 `ADMIN`, NFR-04 deactivation) in Issue #78; the F-07 and F-09 parts of the shared NFR-02 / NFR-10 rows passed there too (TEST-07-06, TEST-07-07, TEST-UI-07H; TEST-09-02, TEST-09-12, TEST-UI-09).
- **Approved changes:** record each change as `CHG-nn` with the date, reason and affected IDs.
  - **CHG-01** (2026-11-28, Lab 7, Issue #74): revision n + 1 needs feedback on revision n.
    Reason: stop silent resubmission (D-01). Affects FR-07, BR-07, NFR-05; F-04, F-05, F-06;
    AC-05-2, AC-05-6, AC-05-8, AC-05-11 … AC-05-13; TEST-05-02, 05-05, 05-06, 05-08, 05-09, 05-11 … 05-13,
    TEST-UI-02, E2E-02. Details: [labs/lab-07/change-request.md](labs/lab-07/change-request.md).
