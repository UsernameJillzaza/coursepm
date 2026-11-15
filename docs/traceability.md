# CoursePM — Requirements traceability

Version 0.1 · 2026-11-15. Requirement → feature → sprint → acceptance criteria → planned tests.
AC and TEST IDs for Sprint 1 are defined in [sprints/sprint-1/](sprints/sprint-1/). Later-sprint rows
have a feature and sprint now; their AC and tests are written when that sprint's contract is prepared.
The **Result** column is filled from the release test run (Part F).

| Requirement | Feature / responsibility | Sprint | AC | Planned tests | Result |
| --- | --- | --- | --- | --- | --- |
| FR-01 | F-01 | 1 | AC-01-1, AC-01-2 | TEST-01-01, TEST-01-02, TEST-01-03, E2E-01 | |
| FR-02 | F-01 | 1 | AC-01-3, AC-01-4 | TEST-01-04, TEST-01-05, E2E-01 | |
| BR-01 | F-01 | 1 | AC-01-6 | TEST-01-08 | |
| NFR-01 | F-01, F-02 | 1 | AC-02-1 | TEST-02-01 | |
| NFR-03 | F-01 | 1 | AC-01-5 | TEST-01-06, TEST-01-07 | |
| NFR-04 | F-01 | 1 | AC-01-4, AC-01-7 | TEST-01-05, TEST-01-09 | |
| BR-02 | F-02, F-03 | 1 | AC-02-2, AC-03-2 | TEST-02-02, TEST-03-02 | |
| BR-03 | F-02, F-03 | 1 | AC-02-3, AC-03-3 | TEST-02-03, TEST-03-03 | |
| NFR-02 | F-02 | 1 | AC-02-2 … AC-02-5 | TEST-02-02 … TEST-02-05 | |
| NFR-07 | F-02 | 1 | AC-02-6 | TEST-02-06 | |
| FR-03 | F-03 | 1 | AC-03-1 | TEST-03-01, E2E-01 | |
| NFR-06 | F-03, R-01 | 1 | AC-03-4 | TEST-03-04, setup check | |
| FR-04 | F-04 | 1 | AC-04-1 | TEST-04-01, E2E-02 | |
| BR-04 | F-04 | 1 | AC-04-2, AC-04-3 | TEST-04-02, TEST-04-03 | |
| BR-05 | F-04 | 1 | AC-04-4 | TEST-04-04, TEST-04-05 | |
| FR-05 | F-04 | 1 | AC-04-5 | TEST-04-06 | |
| FR-06 | F-05 | 1 | AC-05-1 | TEST-05-01, E2E-02 | |
| FR-07 | F-05 | 1 | AC-05-2 | TEST-05-02 | |
| FR-08 | F-05 | 1 | AC-05-7 | TEST-05-09, E2E-02 | |
| BR-06 | F-05 | 1 | AC-05-3 | TEST-05-03, TEST-05-04 | |
| BR-07 | F-05 | 1 | AC-05-4 | TEST-05-05, TEST-05-06 | |
| BR-08 | F-05 | 1 | AC-05-5 | TEST-05-07 | |
| NFR-05 | F-05 | 1 | AC-05-6 | TEST-05-08 | |
| FR-09 | F-06 | 1 | AC-06-1 | TEST-06-01, E2E-02 | |
| FR-10 | F-06 | 1 | AC-06-4 | TEST-06-05, E2E-02 | |
| BR-09 | F-06 | 1 | AC-06-2, AC-06-3 | TEST-06-02, TEST-06-03 | |
| BR-10 | F-06 | 1 | AC-06-5 | TEST-06-04, TEST-06-06 | |
| NFR-10 | R-02 | 1 | AC-04-6, AC-05-8 | TEST-UI-01, TEST-UI-02 | |
| FR-11 | F-07 | 2 | (Sprint 2 contract) | | |
| FR-12 | F-08 | 2 | (Sprint 2 contract) | | |
| FR-13, BR-11 | F-08 | 2 | (Sprint 2 contract) | | |
| FR-14 | F-09 | 2 | (Sprint 2 contract) | | |
| FR-15, NFR-08 | F-10 | 2 | (Sprint 2 contract) | | |
| NFR-09 | R-01 | 2 (Lab 5) | (Lab 5) | | |
| FR-16, BR-12 | F-11 | 3 | (Sprint 3 contract) | | |
| FR-17, FR-18 | F-12 | 3 | (Sprint 3 contract) | | |

## Coverage gaps and approved changes

- **Uncovered requirements:** none. Every FR, BR and NFR in SRS v0.1 maps to a feature or responsibility.
- **Approved changes:** none yet. Record each future change as `CHG-nn` with the date, reason and
  affected IDs.
