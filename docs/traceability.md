# CoursePM — Requirements traceability

Version 0.1 · 2026-11-15. Requirement → feature → sprint → acceptance criteria → planned tests.
AC and TEST IDs for Sprint 1 are defined in [sprints/sprint-1/](sprints/sprint-1/). Later-sprint rows
have a feature and sprint now; their AC and tests are written when that sprint's contract is prepared.
The **Result** column is filled from the release-candidate run on `daefdff` (Part F); a row passes when every planned test that carries one of its IDs passed. Commands: `npm --prefix server test`, `npm --prefix client test`, `npx tsc --noEmit` (server), `npm --prefix client run build`, `npx playwright test`. Counts: server 112/112 passed, 0 failed, 0 skipped · client 39/39 passed, 0 failed, 0 skipped · E2E 3/3 passed, 0 failed, 0 skipped · type-check OK · client build OK. Lab 6 regression tests (`TEST-L6-*`) were added after that run; their results come from the Issue #57 run on `257a152` (server 141/141, client 41/41, 0 failed, 0 skipped); for `TEST-L6-60-*`, the Issue #60 run after merging `lab6-staging` into its branch (server 141/141, client 44/44, 0 failed, 0 skipped; `60-regression-after-merge.txt`); and, for `TEST-L6-58-*`, the Issue #58 run after merging `lab6-staging` into its branch (server 149/149, client 44/44, 0 failed, 0 skipped; `58-regression-after-merge.txt`); logs in `artifacts/lab-06/tdd/`.

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
| BR-05 | F-04 | 1 | AC-04-4 | TEST-04-04, TEST-04-05 | Pass (2/2 tests) |
| FR-05 | F-04 | 1 | AC-04-5 | TEST-04-06 | Pass (1/1 tests) |
| FR-06 | F-05 | 1 | AC-05-1 | TEST-05-01, E2E-02 | Pass (2/2 tests) |
| FR-07 | F-05 | 1 | AC-05-2 | TEST-05-02 | Pass (1/1 tests) |
| FR-08 | F-05 | 1 | AC-05-7 | TEST-05-09, E2E-02 | Pass (2/2 tests) |
| BR-06 | F-05 | 1 | AC-05-3 | TEST-05-03, TEST-05-04 | Pass (2/2 tests) |
| BR-07 | F-05 | 1 | AC-05-4 | TEST-05-05, TEST-05-06 | Pass (2/2 tests) |
| BR-08 | F-05 | 1 | AC-05-5 | TEST-05-07 | Pass (1/1 tests) |
| NFR-05 | F-05 | 1 | AC-05-6, AC-05-9 | TEST-05-08, TEST-05-10 | Pass (2/2 tests) |
| FR-09 | F-06 | 1 | AC-06-1 | TEST-06-01, E2E-02 | Pass (2/2 tests) |
| FR-10 | F-06 | 1 | AC-06-4 | TEST-06-04, E2E-02 | Pass (2/2 tests) |
| BR-09 | F-06 | 1 | AC-06-2, AC-06-3 | TEST-06-02, TEST-06-03 | Pass (2/2 tests) |
| BR-10 | F-06 | 1 | AC-06-5 | TEST-06-05, TEST-06-06 | Pass (2/2 tests) |
| NFR-10 | R-02 | 1 | AC-R02-1, AC-01-10, AC-02-10, AC-04-6, AC-05-8, AC-05-10, AC-06-6 | TEST-R02-01, TEST-UI-05, TEST-UI-04, TEST-UI-01, TEST-UI-02, TEST-UI-07, TEST-UI-06, TEST-L6-60-03 | Pass (8/8 tests) |
| FR-11 | F-07 | 2 | (Sprint 2 contract) | | |
| FR-12 | F-08 | 2 | (Sprint 2 contract) | | |
| FR-13, BR-11 | F-08 | 2 | (Sprint 2 contract) | | |
| FR-14 | F-09 | 2 | (Sprint 2 contract) | | |
| FR-15, NFR-08 | F-10 | 2 | (Sprint 2 contract) | | |
| NFR-09 | R-01, #24, #25, #27, #29 | 2 (Lab 5) | Lab 5 C-03 (fresh clone + `.env.example` → `docker compose up --build` → sign in); readiness probe; graceful shutdown; C-06 release from `main` by pipeline with the running commit visible | TEST-L5-01 … TEST-L5-11, MAN-L5-C03 Cloud Shell run, MAN-L5-C04 live journey, MAN-L5-C05 persistence and rollback | Container part Pass (server 119/119; MAN-L5-C03 Pass on `6d7a685`, stop check on `f7cbfff`); Cloud SQL part Pass (#27 live at `de9213e`, `/api/ready` `db: connected`); C-06 Pass (first automated release `a36ed20`, run 44611810394, revision `coursepm-00002-xvc`, release commit in the served bundle); C-04 and C-05 Pass on 2026-11-20 (live journey with a BR-07 server rejection; record kept through restart, redeploy, rollback and roll forward) |
| FR-16, BR-12 | F-11 | 3 | (Sprint 3 contract) | | |
| FR-17, FR-18 | F-12 | 3 | (Sprint 3 contract) | | |

## Coverage gaps and approved changes

- **Uncovered requirements:** none. Every FR, BR and NFR in SRS v0.1 maps to a feature or responsibility.
- **Approved changes:** none yet. Record each future change as `CHG-nn` with the date, reason and
  affected IDs.
