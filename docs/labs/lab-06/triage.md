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

| Finding | Issue | Case | Contract reference | Classification | Severity and reason | Owner | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEF-CP-01 | #57 | CP-UAT-EX3 | AC-02-2, AC-02-3, AC-03-5, NFR-02 | Accepted defect | **Major**: an edited URL (`/teams/2147483648`) gives 500 on all seven ID routes and replaces the not-found page; `0x1`, `1e0`, `+1` resolve to team 1 | Achirawit | PR #61 | On `lab6-staging`; GG EZ retest pending |
| DEF-CP-02 | #58 | CP-UAT-EX4 | AC-01-2, FR-01 | Accepted defect | **Major** (reporter proposed "Moderate", which is not on the Lab 6 scale): anyone, without signing in, gets a repeatable 500 from the public login endpoint | Jakkarin | PR #64 | On `lab6-staging`; GG EZ retest pending |
| DEF-CP-03 | #59 | CP-UAT-EX5 | BR-08, AC-05-5 | Accepted defect | **Minor**: a validation gap, not a server error; a student can store a host-less or whitespace link to their own revision, which the supervisor cannot open, but no other data is changed or disclosed | Achirawit | PR #65 | On `lab6-staging`; GG EZ retest pending |
| DEF-CP-04 | #60 | CP-UAT-EX6 | F-03 UI rule, AC-03-5, AC-04-3 | Accepted defect | **Minor**: the New milestone form renders for an out-of-scope team, but the server still rejects the submit with 404; nothing is stored or disclosed | Achirawit | PR #62 | On `lab6-staging`; GG EZ retest pending |

No received finding was classified as a duplicate, not-defect or enhancement. All four are fixed in this
lab, so no minor limitation needs to be accepted by the UAT team.

## Self-found findings (Product Team)

| Finding | Issue | Found | Contract reference | Classification | Severity and reason | Owner | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NUL in text fields | #63 | While writing the #58 RED test (same root cause as DEF-CP-02) | AC-04-4, AC-05-5, AC-06-5 | Accepted defect | **Minor**: a NUL in a milestone, submission or feedback field gives 500 instead of 400, but only through a hand-crafted API call; nothing is stored and the UI is unaffected | Jakkarin | PR #66 | In review; verified by TEST-L6-63-01/02 and the post-deploy smoke check |

## Retest

The fixes reach `main` in one reviewed Lab 6 release. After it is deployed, GG EZ re-runs CP-UAT-EX3 …
EX6 and the affected supplied cases on the recorded commit and revision, and records the final Sprint 1
decision. Regression tests and red/green logs for every fix are listed in
[`sts.md`](../../sprints/sprint-1/sts.md) ("Lab 6 regression cases") and stored in
`artifacts/lab-06/tdd/`.
