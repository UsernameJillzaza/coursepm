# CoursePM — Three-sprint plan

Version 0.2 · 2026-11-28 (release tags revised, Issue #73; `v0.2.x` was used by Lab 6). Version 0.1 · 2026-11-15. Feature IDs refer to [../features.md](../features.md).

| Sprint | Dates | Goal | Features | Depends on | Completion outcome / checkpoint |
| --- | --- | --- | --- | --- | --- |
| **1** | 3 – 15 Nov 2026 | A small working domain slice with real authentication, permissions and persistence: a supervisor sets a milestone, a team submits (within the deadline and revision rules), and the supervisor gives feedback. | R-01 scaffold, R-02, F-01, F-02, F-03, F-04, F-05, F-06 | — | Release `v0.1.0` on `main`; **Deliverable 1, 15 Nov**. Lab 5 then containerizes and deploys this release (remaining R-01 work). |
| **2** | 16 – 29 Nov 2026 | Expand the core under engineering contracts: history, milestone maintenance, administration, progress. | F-07, F-08, F-09, F-10, R-01 upkeep | F-04, F-05, F-06 | Release `v0.3.0` (the accepted Sprint 2 release) deployed; **Deliverable 2, 29 Nov** (Sprint 2 complete), submitted as candidate `v0.4.0-rc.1` with implemented Sprint 3 work. |
| **3** | 30 Nov – 13 Dec 2026 | Remaining features, integration and hardening. | F-11, F-12, regression + UAT fixes | F-06, F-10 | Progress shown at 29 Nov; final release `v1.0.0` by **13 Dec**. |

## Why Sprint 1 is scoped like this

Sprint 1 is the theme's example slice and nothing more (spec §6, theme 6). It is the **thinnest path that
still exercises every layer and every rule type**: authentication (F-01), two roles with
record scope (F-02, F-03), one domain transaction with two business rules (F-05 deadline + revision
limit) and an association that must be preserved (F-06 feedback ↔ revision). Teams come from the seed
(D-04), so we don't build administration screens before the domain works. Features are ordered by
dependency: F-01 → F-02/F-03 → F-04 → F-05 → F-06.

**Feasibility.** Most of F-01 and F-02 is adapted from our TokTickIT Lab 3 auth code (scrypt hashes, a
hashed session cookie, the test setup); role checks are done inside each handler after the scope check
(D-03), not by a role middleware. That leaves Sprint 1's new work in
F-03 … F-06: six tables and eight endpoints.

**What moves if time runs short:** the side-by-side comparison (F-07) and CSV export (F-12) are the first
to cut, since no other feature depends on them. Any change of scope is recorded as `CHG-nn` in
[../traceability.md](../traceability.md).
