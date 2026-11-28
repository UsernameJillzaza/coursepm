# F-07 Revision history and comparison — feature contract

Version 1.1 · 2026-11-28 (page renamed to `/revisions`, PR #76 review; 1.0 same day) · Issue: #73 (contract); implementation: S2-3 (Issue to be created) ·
Links: FR-11, FR-07, FR-08, FR-10, BR-02, BR-03, NFR-02, NFR-10, D-03, D-08 ·
Depends on: F-05 (revisions), F-06 (feedback per revision)

## Purpose

F-05 already stores every revision unchanged and lists them newest first on the milestone page
(FR-07, FR-08), with each revision's feedback (F-06). What a team or supervisor cannot do yet is
**see what changed between two revisions** (FR-11). F-07 adds a revisions page for one milestone and a
side-by-side comparison of any two of its revisions, with the differences marked.

The comparison is **read-only and computed on request**. Nothing new is stored, and no rule about
submitting, the deadline or the revision limit changes.

## Behavior and workflow

1. Anyone in the milestone's scope (the team's students and its assigned supervisors, BR-02/BR-03)
   opens the milestone page and follows **Compare revisions** to
   `/milestones/:milestoneId/revisions`. (The page is not called "history": F-08's
   `GET /api/milestones/:milestoneId/history` is the milestone's change history, a different thing.)
2. The revisions page lists every revision, newest first, with revision number, title, submitter, time
   (Bangkok, D-05) and whether it has feedback. Each row has a checkbox.
3. When exactly two revisions are checked, **Compare** becomes active. Pressing it requests the
   comparison and shows it side by side: the **older** revision on the left, the **newer** on the
   right, whatever order they were checked in. The selection is kept in the URL
   (`?a=<older>&b=<newer>`), so a reload or a shared link shows the same comparison.
4. For each field the page marks whether it changed. Title and link are compared as whole values.
   The description is compared word by word: removed words are struck through on the left, added
   words are highlighted on the right, and unchanged words are plain on both sides. Each side also
   shows its submitter, time and feedback (or "No feedback yet").
5. With fewer than two revisions the page explains why there is nothing to compare: "No revisions
   yet." or "Only one revision so far; compare needs two."

### Check order

scope 404 (the milestone, through `loadMilestoneForUser`) → query shape 400 (`a`, `b`) → both
revisions exist **in this milestone** 404 → compute and answer 200.

A revision number that exists only in another milestone, or in another team, is "not found" for this
milestone (D-03). There is no role check: every role that can read the milestone may compare its
revisions.

### Rule functions (pure, unit-tested)

In `server/src/rules/revisionDiff.ts`:

- `parseRevisionPair(query)` → `{ ok: true, older, newer }` | `{ ok: false, fields }`. `a` and `b` are
  each required and must be canonical positive integers (the `parseId` format, so `01`, `1e0`, `+1`
  and `2147483648` are rejected); they must differ. The smaller becomes `older`. Messages:
  `fields.a` / `fields.b` "Choose a revision number." and, when equal, `fields.b`
  "Choose two different revisions.".
- `diffWords(oldText, newText)` → `[{ op: 'same' | 'removed' | 'added', text }]`. Text is split into
  words and the whitespace between them; the longest common subsequence of words decides what is
  `same`; neighbouring parts with the same `op` are merged. Joining the `same` + `removed` parts
  gives back `oldText` exactly, and `same` + `added` gives back `newText` exactly. Descriptions are at
  most 2,000 characters (BR-08), so the quadratic algorithm stays small.
- `compareRevisions(older, newer)` → `{ title: { changed }, link: { changed }, description:
  { changed, parts: diffWords(...) } }`. Values are compared after the trimming already applied at
  submit time (F-05), so they are compared exactly as stored.

## UI

- **Milestone page:** a **Compare revisions** link next to the Submissions heading, for every role
  that sees the page. Nothing else on the page changes.
- **`/milestones/:milestoneId/revisions`** (inside `RequireAuth`):
  - Breadcrumb back to the team and the milestone; the milestone title and deadline.
  - The revision list with loading, empty and error states (NFR-10) and a checkbox per row. When
    two are checked the other checkboxes are disabled until one is unchecked.
  - **Compare** (disabled unless exactly two are checked). The comparison panel shows two columns
    from 768 px wide and stacks them (older first) below that, with no horizontal page scroll.
  - Changed fields carry a `Changed` badge; unchanged ones an `Unchanged` badge. Links are clickable
    on both sides (`rel="noopener noreferrer"`, as in F-05).
  - A 404 from either request shows the same "Milestone not found" page as the milestone route; a
    400 from a hand-edited URL shows "Choose two different revisions to compare." with the list
    still usable.

## API

| Method & path | Request | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/milestones/:milestoneId/submissions` | — (F-05, **no change**) | 200 `{ items }` | 401, 404 |
| `GET /api/milestones/:milestoneId/compare?a=<n>&b=<n>` | query `a`, `b` | 200 `{ comparison }` | 400, 401, 404 |

- The revisions list reuses the existing F-05 list: it already returns every revision newest first
  with `submittedBy`, `submittedAt` and `feedback` (AC-05-7, AC-06-4).
- **`comparison`**: `{ milestoneId, older: revision, newer: revision, changes: { title: { changed },
  link: { changed }, description: { changed, parts: [{ op, text }] } } }`, where `revision` is the
  F-05 list item shape (`id, revision, title, description, link, submittedAt, submittedBy: { id,
  name }, feedback | null`).
- **Errors** use the standard shape from `http.ts`: 400 `VALIDATION_ERROR` "Please correct the
  highlighted fields." with `fields.a` / `fields.b`; 404 `NOT_FOUND` "Milestone not found." (scope)
  or "Revision not found." (a revision number not in this milestone); 401 without a session.

## Data

**No change.** The comparison reads `Submission` and `Feedback` rows that F-05 and F-06 already keep
unchanged (BR-07 append-only revisions). No migration.

**Files expected to change:**
- new `server/src/rules/revisionDiff.ts`; `server/src/submissions/routes.ts` or a new
  `server/src/milestones/compare.ts` mounted at `/api/milestones/:milestoneId/compare`
- client: the revisions page, its route in `App.tsx`, the link on the milestone page, API helpers
- `docs/system-sds.md` (route table), `docs/traceability.md`

## Acceptance criteria

| ID | Given / When / Then |
| --- | --- |
| AC-07-1 | An Alpha milestone has revisions 1, 2 and 3 (inserted with known titles, links and descriptions; feedback on revision 1). A1 and Supervisor 1 each request `compare?a=1&b=3` → 200; `older` is revision 1 with its feedback, `newer` is revision 3 with `feedback: null`, both in the F-05 item shape. |
| AC-07-2 | `compare?a=3&b=1` returns the same body as `a=1&b=3` (older always left). |
| AC-07-3 | With revision 1 description `Draft of the SRS` and revision 3 `Final draft of the SRS v2`: `description.changed` is true; joining `same` + `removed` parts gives the old text and `same` + `added` the new text, exactly; `Draft` is `removed`, `Final draft` and `v2` are `added` (words compare case-sensitively), and `of the SRS` is `same`. An equal title → `title.changed` false; a different link → `link.changed` true; two equal descriptions → `changed` false with one `same` part. |
| AC-07-4 | Validation: `a` missing, `b` missing, `a=0`, `a=abc`, `a=01`, `a=1e0`, `a=2147483648`, `a=b=2` → 400 naming `a` or `b`; nothing else is read. |
| AC-07-5 | Scope: Supervisor 2 and B1 compare on the Alpha milestone → 404 "Milestone not found."; an unknown or malformed milestone ID → 404; without a session → 401. |
| AC-07-6 | Revision existence: `compare?a=1&b=9` on a milestone with three revisions → 404 "Revision not found."; a revision number that exists only in another Alpha milestone → the same 404. |
| AC-07-7 | Empty and single cases: the revisions page of a milestone with no revision shows "No revisions yet."; with one revision it shows the list and "Only one revision so far; compare needs two.", and Compare is disabled. |
| AC-07-8 | UI: the list has loading, empty and error states; Compare is disabled until exactly two are checked and a third checkbox is disabled; checking revision 3 then 1 shows 1 on the left; the URL carries `?a=1&b=3` and a reload shows the same comparison; changed fields show `Changed`, removed words are struck through and added ones highlighted; at 375 px the columns stack and the page has no horizontal scroll. |
| AC-07-9 | Read-only: after any number of compare requests the revision, feedback and milestone rows are unchanged (counts and `submittedAt` equal before and after). |

## Software test specification (planned)

TEST-07-01 … TEST-07-08 and TEST-UI-07H in the Sprint 2 [sts.md](sts.md), with levels, inputs and
expected results (`TEST-UI-07H`, not `TEST-UI-07`, because Sprint 1 already uses `TEST-UI-07`). Each RED test is committed before its implementation. Logs go in
`artifacts/sprint-2/tdd/F-07-*.txt`.

## Definition of Done

The Sprint 1 [definition-of-done.md](../sprint-1/definition-of-done.md) applies, plus:
- [ ] No migration and no change to the F-05 list; TEST-05-* and TEST-06-* pass without their
      expectations being changed.
- [ ] Every AC-07-n has a passing test in the STS, with file › name and the tested commit. The
      traceability rows are filled in.
- [ ] The comparison works for a 2,000-character description on both sides inside the NFR-08
      budget (measured once in the TEST-07-07 run and noted in its log).
- [ ] The PR is reviewed by Achirawit and merged into `sprint2-staging`, and the Issue moves to Done
      on board #8.
