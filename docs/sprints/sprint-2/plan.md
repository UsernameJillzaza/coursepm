# CoursePM — Sprint 2 plan (Deliverable 2 + Sprint 3 progress)

Version 0.1 (draft for review) · 2026-11-28 · Feature IDs refer to [../../features.md](../../features.md),
requirement IDs to [../../srs.md](../../srs.md). Three-sprint overview: [../plan.md](../plan.md).

**Status:** proposal. No Sprint 2 Issues, board or feature branches exist yet; they are created
after this plan is approved in review.

## 1. Deadline and what is graded

Deliverable 2, Lab 6 and Lab 7 are all due **Sun 29 Nov 2026, 23:59** (LEB2).

| Item | Points | State on 28 Nov | Left |
| --- | --- | --- | --- |
| Project Deliverable 2 | 70 project points (7%) | Sprint 2 not started | everything below |
| Lab 6 | 100 lab points | Fixes released in `v0.2.1` (`a342ed5`, revision `coursepm-00008-j5m`); GG EZ retest `UAT-20261125-GGEZ-R2` PASS — recorded in `docs/labs/lab-06/triage.md` on `lab6-staging` (PR #71), not yet on `main` | Part A document (CP-UAT-01…06) + PDF |
| Lab 7 | 100 lab points | needs a TA-approved change request | whole lab |

Deliverable 2 rubric: A Sprint 1 continuity and change status 5 · **B Sprint 2 contracts and
working increment 25** · C Sprint 3 contracts and working progress 15 · D updated requirements and
traceability 10 · E integrated, deployed release candidate 15.

## 2. Scope

| Feature | What | Requirements | Depends on | Sprint |
| --- | --- | --- | --- | --- |
| F-07 | Revision history + side-by-side comparison of two revisions | FR-11 | F-05 | 2 |
| F-08 | Edit / close a milestone with an audit record (who + when + old/new value); deadline extension for one team | FR-12, FR-13, BR-11 (+ D-06, to be added to `features.md`) | F-04 | 2 |
| F-09 | `ADMIN` role: create teams, assign students/supervisors, deactivate accounts | FR-14, BR-01 | F-03 | 2 |
| F-10 | Team progress board (Not submitted / Submitted / Feedback given / Overdue / Closed) with drill-down | FR-15, NFR-08 | F-05, F-06 + **F-08** (Closed state, extended deadline; `features.md` lists only F-05, F-06 — added in S2-0) | 2 |
| F-11 | Score 0–100, release control, change reason | FR-16, BR-12, Q-01 | F-06 | 3 — **implemented now** as the required working Sprint 3 rule |
| F-12 | Cross-team summary + CSV export | FR-17, FR-18 | F-10, F-11 | 3 — contract only by 29 Nov |

Notes from the current code (`server/prisma/schema.prisma` on `a342ed5`):

- `User.isActive` already exists (F-01 rejects inactive accounts), so F-09 only adds the `ADMIN`
  enum value plus the admin endpoints and screens.
- A `Milestone` belongs to exactly one team (`teamId`). A "per-team extension" (BR-11) is therefore
  a recorded change to that milestone's effective deadline, not a separate team list. The F-08
  contract must say this explicitly (new decision **D-09** in the SRS, refining BR-11 and D-06;
  D-07 and D-08 are taken).

## 3. Issues, authors and reviewers

Issue numbers are assigned on creation (the next free number is about #72).

| Issue | Branch | Author | Reviewer | Commits, in order |
| --- | --- | --- | --- | --- |
| S2-0 Sprint 2/3 contracts | `docs/<n>-sprint2-contracts` | Achirawit | Jakkarin | `docs:` F-07…F-10 contracts (SDS, UI/API/data, AC, DoD) · `docs:` STS test IDs · `docs:` F-11/F-12 contracts · `docs:` SRS D-09, `features.md` (F-08 + D-06, F-10 + F-08), `sprints/plan.md` tags · `docs:` change log (CHG-nn) |
| S2-1 F-08 milestone maintenance + extension | `feature/<n>-milestone-maintenance` | Achirawit | Jakkarin | `feat:` migration (`closedAt`, audit table, extension table, DB check new deadline > current) · `test:` failing BR-11 + edit/close tests · `feat:` API · `feat:` UI · `test:` E2E |
| S2-2 F-09 course administration | `feature/<n>-admin` | Jakkarin | Achirawit | `feat:` migration (`ADMIN` enum) · `test:` failing non-admin 403, deactivated-login and existing-session-after-deactivation → 401 (NFR-04) tests · `feat:` API · `feat:` UI |
| S2-3 F-07 revision history + compare | `feature/<n>-revision-history` | Jakkarin | Achirawit | `test:` failing out-of-scope test · `feat:` API · `feat:` UI comparison |
| S2-4 F-10 progress board | `feature/<n>-progress-board` | Achirawit | Jakkarin | `test:` failing state-derivation unit tests · `feat:` API (states computed on the server) · `feat:` UI + drill-down · `test:` NFR-08 smoke, 50 requests on **every** main list endpoint (teams, milestones, submissions, board) |
| S2-5 Sprint 2 release | `sprint2-staging` → `main` | Achirawit | Jakkarin | release PR, tag **`v0.3.0`** (the accepted Sprint 2 release, kept identifiable) |
| S3-1 F-11 scoring + release | `feature/<n>-scoring` | Jakkarin | Achirawit | `feat:` migration (score, released flag, change-reason table) · `test:` failing BR-12 · `feat:` API · `feat:` UI |
| S3-0 Deliverable 2 candidate | `sprint3-staging` → `main` | Achirawit | Jakkarin | release PR, tag **`v0.4.0-rc.1`**, deploy; `docs:` SRS / features / system SDS / traceability update; evidence |

- **Migration order = merge order:** S2-1 → S2-2 → S3-1.
- **Parallel work:** after S2-0 merges, S2-1 and S2-2 run in parallel; then S2-3 and S2-4 (S2-4
  needs S2-1 merged). Each branch is cut from the updated `sprint2-staging`.

## 4. Branch flow

```
main (a342ed5, v0.2.1 — Lab 6 graded release)
 ├─ sprint2-staging
 │   ├─ docs/<n>-sprint2-contracts
 │   ├─ feature/<n>-milestone-maintenance, feature/<n>-admin
 │   ├─ feature/<n>-revision-history, feature/<n>-progress-board
 │   └─ release PR → main → tag v0.3.0 (auto-deploy)
 └─ sprint3-staging (from main after v0.3.0)
     └─ feature/<n>-scoring → release PR → main → tag v0.4.0-rc.1 (auto-deploy = Deliverable 2 candidate)
```

Same rules as Sprint 1: PR body starts with `Closes #n`, reviewer = the other student, label
`sprint-2` / `sprint-3`, failing test committed before the implementation (red/green logs in
`artifacts/sprint-2/tdd/`), merge (never rebase) staging into a feature branch that falls behind.

## 5. Tests and evidence (brief §4.2)

- Completion table per Sprint 2 feature: AC → STS ID → test file/name → result → commit/release.
- TDD red/green logs for at least BR-11, the admin 403 and BR-12.
- Two embedded test excerpts: one domain rule (BR-11) and one access restriction (non-admin → 403
  or student cannot see an unreleased score).
- Two Issue/PR chains: S2-1 and S2-2 (one per author).
- Program demonstrations (captioned, with version): F-08, F-10, F-11 and the Sprint 1 journey on the
  candidate; each shows retrieval of saved data, a rule rejection and a backend 403/404 response.
- Release evidence: build/test/CI counts on the candidate commit; Cloud Run revision ↔ tag ↔ CI
  run; post-deploy health and persistence check.
- Part A: the `v0.1.0` (`5d76a78`) journey re-run on the candidate, plus the change/defect register
  (Lab 5 findings, DEF-CP-01…04, CHG-nn) with re-test outcomes.
- Part D: updated SRS, feature inventory, system SDS and one full traceability matrix with gaps.
- Part E: readiness review and a dated plan to 13 Dec (F-12, remaining AC, final UAT, video).

## 6. Time box (ICT)

| When | What |
| --- | --- |
| Sat 28, 17:00–20:00 | review this plan; ask the TA to approve the Lab 7 change; Issues, board, `sprint2-staging`; S2-0 contracts PR; Lab 6 Part A |
| Sat 28, 20:00 – Sun 29, 04:00 | S2-1 + S2-2 built, self-reviewed, cross-reviewed |
| Sun 29, 04:00–12:00 | S2-3 + S2-4; release S2-5 → `v0.3.0` |
| Sun 29, 12:00–16:00 | S3-1 F-11 → `v0.4.0-rc.1`; Lab 7 change (if approved) |
| Sun 29, 16:00–22:30 | evidence, traceability, Deliverable 2 PDF; Lab 6 PDF; Lab 7 PDF |
| Sun 29, 22:30–23:59 | buffer and upload |

**Checkpoint Sun 29, 12:00** (moved to 08:00 in the review): if F-07 or F-10 has not merged, ask the TA and, if approved, record the next free `CHG-nn` (for example, F-07
history list without the side-by-side view) and disclose it in the completion table. The brief
forbids silently moving work to Sprint 3, not disclosing a reduced scope.

## 7. Open decisions (please answer in the review)

1. **`main` freeze vs. Deliverable 2.** Lab 6 keeps `main` on `a342ed5` while it is graded (a push
   redeploys), but Deliverable 2 needs a new deployed candidate. Proposal: give revision
   `coursepm-00008-j5m` a Cloud Run revision tag (stable URL, no traffic) before the first Sprint 2
   push to `main`. Needs the GCP owner.
2. **Author split** in §3 — OK, or swap any feature?
3. **Board:** new project "CoursePM Sprint 2", or reuse "CoursePM Sprint 1" (#6)?
4. **Lab 7 change request:** which existing behaviour do we propose to the TA (e.g. the revision
   limit or the link-validation rule)? It cannot be a backlog feature such as F-08.
5. **Tags** `v0.3.0` (Sprint 2) and `v0.4.0-rc.1` (Deliverable 2 candidate) — OK? `../plan.md`
   currently says `v0.2.x` for Sprint 2 (already used by Lab 6), so S2-0 updates it.
6. **BR-11 interpretation** in §2 (D-09: extension = recorded change of the one team's milestone
   deadline) — OK?
