# Sprint 1 — Issues, branches and PR order

Flow (spec §8.3): Issue → `feature/<n>-<slug>` cut from **`sprint1-staging`** → PR into `sprint1-staging`
reviewed by the teammate → release PR `sprint1-staging` → `main` → tag `v0.1.0`.
**A** = `UsernameJillzaza`, **B** = `jakkarin-promsee` (team TH-042_P6). The PR author and reviewer
always differ. Pair contributions are recorded in the Issue or PR description; the person approving
the PR is not its author. Each of us authors about half of the Issues (spec §2: no permanent "spec
writer" / "coder" split).

| # | Issue title | Branch | Author / reviewer | Cut from | Contract / IDs |
| --- | --- | --- | --- | --- | --- |
| 1 | docs: product baseline (SRS, features, traceability, system SDS, sprint plan) | `feature/1-product-baseline` | A / B (pair contributions recorded) | `sprint1-staging` | Parts A–D |
| 2 | docs: Sprint 1 feature contracts, STS and Definition of Done | `feature/2-sprint1-contracts` | B / A | `sprint1-staging` after #1 | Part E, F-01 … F-06 and R-01/R-02 scaffold contract |
| 3 | chore: project scaffold (Express + Prisma + React + Vitest + Playwright, health check) | `feature/3-scaffold` | A / B | after #2 | R-01, R-02; [scaffold contract](R-01-R-02-scaffold.md), AC-R01-1 … AC-R01-3, AC-R02-1; TEST-R01-01 … TEST-R01-03, TEST-R02-01 |
| 4 | feat: F-01 authentication and session | `feature/4-auth` | A / B | after #3 | AC-01-1 … AC-01-11; first account seed and migration |
| 5 | feat: F-02 + F-03 access scope, teams and seed | `feature/5-teams-scope` | B / A | after #4 | AC-02-*, AC-03-* |
| 6 | feat: F-04 milestone creation and list | `feature/6-milestones` | B / A | after #5 | AC-04-* |
| 7 | feat: F-05 submissions with the deadline and revision rules (TDD) | `feature/7-submissions` | A / B | `sprint1-staging` after #6 merges | AC-05-* |
| 8 | feat: F-06 feedback on a revision | `feature/8-feedback` | B / A | after #7 | AC-06-* |
| 9 | test/docs: E2E journeys, README, filled-in traceability results | `feature/9-e2e-release-docs` | A / B (pair contributions recorded) | `sprint1-staging` after #8 merges | E2E-01, E2E-02, E2E-03, DoD 6 |
| — | release: Sprint 1 → `main` | PR `sprint1-staging` → `main` | A / B | — | tag `v0.1.0` |

**Commit pattern inside each feature branch** (shows contract → test → code):
`test: add failing <rule> tests (AC-…)` → `feat: implement <rule>` → `test: API/permission tests` →
`docs: update STS actual results`. For #7 the first commit **must** be the failing `checkCanSubmit` unit
tests; screenshot that red run for Part F (TDD evidence).

## Issue body template

```markdown
## Feature / contract
F-0x — docs/sprints/sprint-1/F-0x-….md (version 1.0)

## Requirements
FR-…, BR-…, NFR-…

## Acceptance criteria
- [ ] AC-0x-1 …
- [ ] AC-0x-2 …

## Planned tests
TEST-0x-01 … (see sts.md)

## Done when
Product Definition of Done items 1–8 are met; PR reviewed by <teammate>.
```
