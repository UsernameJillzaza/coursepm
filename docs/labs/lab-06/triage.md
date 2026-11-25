# CoursePM — Lab 6 finding triage

Product Team TH-042_P6 (Achirawit Prasom, Jakkarin Promsee). Findings against the delivered Sprint 1
scope (F-01 … F-06, FR-01 … FR-10) of `main` `8c17581` / Cloud Run revision `coursepm-00007-vkl`, as
tested by the independent UAT team **GG EZ** (Team 23, Section 31: Phongsatorn Phutthason, Rapeepitcha
Warasinkulpat), run `UAT-20261121-GGEZ` on 2026-11-21 15:46–16:20 ICT. Their supplied cases
CP-UAT-01 … 06 all passed; the four failures below come from their exploratory cases CP-UAT-EX3 … EX6.
Each finding is tracked in its own GitHub Issue, which holds the full report and evidence IDs.

## Severity rule

Lab 6 uses Critical / Major / Minor, and Critical and Major block Sprint 1 acceptance. We apply one rule
to every finding:

- **Critical**: unauthorised access to, or loss or corruption of, protected data. No finding reached
  this level.
- **Major**: a server error, or a request resolving to the wrong record, that an ordinary user can
  trigger through the product itself: the UI, an edited browser URL, or a public endpoint such as login.
- **Minor**: a validation or UI-consistency gap where access control and stored records stay correct, or
  a server error that only a hand-crafted API request can trigger. No protected data is changed or
  disclosed.

DEF-CP-01 and #63 are both 500s for a signed-in user, but they fall on different sides of this rule:
DEF-CP-01 is reached by editing a browser URL and breaks the not-found page for every resource, while #63
needs a hand-crafted API call (no form can produce the character) and leaves the UI unaffected.

## Received findings (from GG EZ)

All four were reported by GG EZ (Phongsatorn Phutthason, Rapeepitcha Warasinkulpat) against `8c17581` /
`coursepm-00007-vkl` in run `UAT-20261121-GGEZ`; each Issue holds their reproduction steps, expected and
actual results and evidence IDs.

| Finding | Issue | Case | Contract reference | Classification | Severity and reason | Owner | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEF-CP-01 | #57 | CP-UAT-EX3 | AC-02-2, AC-02-3, AC-03-5, NFR-02 | Accepted defect | **Major**: an edited URL (`/teams/2147483648`) gives 500 on all seven ID routes and replaces the not-found page; `0x1`, `1e0`, `+1` resolve to team 1 | Achirawit | PR #61 | Released in `v0.2.1`; GG EZ retest **PASS** (`UAT-20261125-GGEZ-R2`); Issue closed |
| DEF-CP-02 | #58 | CP-UAT-EX4 | AC-01-2, FR-01 | Accepted defect | **Major** (reporter proposed "Moderate", which is not on the Lab 6 scale): anyone, without signing in, gets a repeatable 500 from the public login endpoint | Jakkarin | PR #64 | Released in `v0.2.1`; GG EZ retest **PASS** (`UAT-20261125-GGEZ-R2`); Issue closed (closed by hand on 2026-11-22, before the release; retest recorded in a comment) |
| DEF-CP-03 | #59 | CP-UAT-EX5 | BR-08, AC-05-5 | Accepted defect | **Minor**: a validation gap, not a server error; a student can store a host-less or whitespace link to their own revision, which the supervisor cannot open, but no other data is changed or disclosed | Achirawit | PR #65 | Released in `v0.2.1`; GG EZ retest **PASS** (`UAT-20261125-GGEZ-R2`); Issue closed |
| DEF-CP-04 | #60 | CP-UAT-EX6 | F-03 UI rule, AC-03-5, AC-04-3 | Accepted defect | **Minor**: the New milestone form renders for an out-of-scope team, but the server still rejects the submit with 404; nothing is stored or disclosed | Achirawit | PR #62 | Released in `v0.2.1`; GG EZ retest **PASS** (`UAT-20261125-GGEZ-R2`); Issue closed |

No received finding was classified as a duplicate, not-defect or enhancement. All four are fixed in this
lab, so no minor limitation needs to be accepted by the UAT team.

**Known limitation (not a finding).** The #59 link check is syntactic, not DNS or host-character
validation: hosts such as `http://-.com` or `http://1.2.3` still pass because each has a non-empty host
(PR #65). It is not part of DEF-CP-03's class, so it needed no acceptance by the UAT team.

## Self-found findings (Product Team)

| Finding | Issue | Found | Contract reference | Classification | Severity and reason | Owner | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NUL in text fields | #63 | While writing the #58 RED test (same root cause as DEF-CP-02) | AC-04-4, AC-05-5, AC-06-5 | Accepted defect | **Minor**: a NUL in a milestone, submission or feedback field gives 500 instead of 400, but only through a hand-crafted API call; nothing is stored and the UI is unaffected | Jakkarin | PR #66 | Released in `v0.2.1`; verified by TEST-L6-63-01/02 and the post-deploy smoke check; not on GG EZ's retest list (self-found), but their regression on the same revision passed; Issue closed |

## Release and independent retest

| Item | Record |
| --- | --- |
| Defective release (tested by GG EZ) | `main` `8c17581`, Cloud Run `coursepm-00007-vkl`; run `UAT-20261121-GGEZ`, 2026-11-21 15:46–16:20 ICT |
| Fixes | PRs #61, #62, #64, #65, #66 into `lab6-staging`, each RED → GREEN with full regression (`artifacts/lab-06/tdd/`); triage #67; E2E 3/3 on `1ab4ea2` (#68) |
| Corrected release | release PR #69 merged 2026-11-25 21:21 ICT → `main` `a342ed5`, tag `v0.2.1`; deploy run 45633245987 (smoke test passed, release commit in the served bundle) → Cloud Run **`coursepm-00008-j5m`** |
| Independent retest | GG EZ (Phongsatorn Phutthason, Rapeepitcha Warasinkulpat), run `UAT-20261125-GGEZ-R2`, 2026-11-25 21:48–21:54 ICT: DEF-CP-01 … 04 **4/4 PASS**, CP-UAT-01 … 06 **6/6 PASS**, 0 blocked |
| **Final Sprint 1 decision** | **Accepted**, no conditions or limitations, agreed by both GG EZ testers, 2026-11-25 21:54 ICT, for `a342ed5` / `coursepm-00008-j5m` |

Regression tests and red/green logs for every fix are listed in
[`sts.md`](../../sprints/sprint-1/sts.md) ("Lab 6 regression cases") and stored in
`artifacts/lab-06/tdd/`.

## Outgoing reports (TH-042_P6 as the UAT team for SprintDUO)

We tested GG EZ's **SprintDUO** (`main` `3fe4f48`, "Release B") with their cases UAT-01 … 05 (5/5 PASS) and
exploratory checks, and reported these findings. Their classification and fixes are in their repository
([JinggXd/course-project-sprintDUO](https://github.com/JinggXd/course-project-sprintDUO), label `lab6`). The
severities we proposed follow the same rule as above.

| Finding | Reported by | Their Issue | Our proposed severity | Their classification and disposition | Our retest on `91db0b1` / `sprintduo-00006-wp7` |
| --- | --- | --- | --- | --- | --- |
| DEF-SD-01: IDs ≥ 2147483648 → 500 on 5 ID routes; `1e0`, `+1` resolve | Achirawit (found in the first run; their Issue lists both of us, from our v2 package) | #29 | Major | Accepted defect, Major; fixed in their PR #34 | **PASS** (404 on every route) |
| DEF-SD-02: success / error banners survive Log Out and Sign In | Achirawit (found in the first run; their Issue lists both of us, from our v2 package) | #32 | Minor | Accepted defect, Minor; fixed in PR #34 | **PASS** |
| DEF-SD-03: Submit Work form offered on a PAST DUE milestone | Achirawit | #33 | Minor | Accepted minor defect; deferred to Sprint 2 as a documented known limitation (server still returns 400 `DEADLINE_PASSED`) | Not fixed; **accepted by us as a minor limitation** |
| DEF-SD-04: 80,000-character bodies → 500 instead of 413 | Jakkarin | #30 | Major | Accepted defect, Major; fixed in PR #34 | **PASS** (413; malformed JSON 400) |
| DEF-SD-05: unsent form drafts survive Log Out across users and teams | Jakkarin | #31 | Major | Accepted defect, Major; fixed in PR #34 | **PASS** |
| ENH-SD-01 … 04 (e.g. ENH-SD-01: `http:///path` accepted, which meets their "starts with http://" rule) | Achirawit, Jakkarin | – | Enhancement | Enhancement, outside the Sprint 1 contract; Sprint 2 backlog | Not required for acceptance |

**Our final decision for SprintDUO:** **Accepted with explicitly documented minor limitations** (DEF-SD-03),
for `main` `91db0b1` / Cloud Run `sprintduo-00006-wp7`, agreed by both TH-042_P6 students (recorded as "Decision
agreed by both" in the final package `Lab6_Retest_And_Decision_SprintDUO_Package_final.zip`, 2026-11-25 19:14 ICT)
after the retest
on 2026-11-25 (Achirawit 18:12–18:26 ICT, full retest and regression; Jakkarin 18:58–19:08 ICT, UI re-check
of DEF-SD-04, 05 and 02).

## Notifications

| When (ICT) | From → to | What |
| --- | --- | --- |
| 2026-11-21 | GG EZ → TH-042_P6 | Return package for CoursePM: CP-UAT-01 … 06 results and findings DEF-CP-01 … 04 |
| by 2026-11-23 | TH-042_P6 → GG EZ | Our SprintDUO results package (v2): UAT-01 … 05 results, DEF-SD-01 … 05, ENH-SD-01 … 04 |
| 2026-11-23 11:34 | GG EZ (their Issue #28) | Triage of our findings (DEF-SD-01, 02, 04, 05 accepted and fixed; DEF-SD-03 deferred; ENH-SD-01 … 04 enhancements) |
| 2026-11-23 12:01 | GG EZ | Their release PR #35 merged → `91db0b1`, deployed as `sprintduo-00006-wp7` |
| 2026-11-25 | GG EZ → TH-042_P6 | Their corrected revision `sprintduo-00006-wp7` ready for retest |
| 2026-11-25 (after 19:14) | TH-042_P6 → GG EZ | Our retest results and decision for SprintDUO |
| 2026-11-25, before 21:21 | TH-042_P6 → GG EZ | Notice that the CoursePM Lab 6 release would be deployed |
| 2026-11-25, after 21:26 | TH-042_P6 → GG EZ | Corrected release `a342ed5` / `coursepm-00008-j5m` and the Issue links for retest |
| 2026-11-25 21:54 | GG EZ → TH-042_P6 | Retest results and final decision **Accepted**; evidence package received 22:15 |
