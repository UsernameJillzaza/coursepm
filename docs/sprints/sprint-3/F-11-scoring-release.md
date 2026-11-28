# F-11 Milestone scoring and release — feature contract

Version 1.0 · 2026-11-28 · Issue: #73 (contract); implementation: S3-1 (Issue to be created), the
Sprint 3 rule implemented for Deliverable 2 · Links: FR-16, BR-12, BR-02, BR-03, BR-09, NFR-02,
NFR-10, D-03, D-05, **D-10** (answers Q-01) · Depends on: F-06 (assigned-supervisor rule), F-04
(milestone) · Used by: F-12 (`score`, `score_released` export columns)

## Purpose

An assigned Supervisor records **one score from 0 to 100 for a team's milestone** (FR-16). The team
sees it **only after the Supervisor releases it**, and once released it **can be changed only with a
recorded reason** (BR-12). Every value the score ever had, every release and every reason stays in a
history the Supervisor can read.

**D-10 (answers Q-01):** feedback keeps its Sprint 1 behaviour and is visible to the team as soon as
it is saved; only the **score** is held back until release. Feedback is formative (the team acts on it
in the next revision); the score is the summative judgement. Decided by the team, 2026-11-28 (#73).

| | Before release | After release |
| --- | --- | --- |
| Supervisor sees | the value, "Not released", the history | the value, "Released <time> by <name>", the history |
| Team (Students) see | "Score not released yet." — the value is in **no** response | the current value and the release time; not the history or reasons |
| Supervisor may change the value | yes; a reason is optional | yes, **only with a reason** (3–500 characters) |
| Release | allowed once a score exists | already released: 409 |

There is no "un-release": BR-12 gives the team a stable view, and a correction is a change with a
reason.

## Behavior and workflow

1. An assigned Supervisor opens a milestone. A **Score** panel shows the current state from
   `GET /api/milestones/:id/score`.
2. **Set or change:** the Supervisor enters a whole number 0–100 (and a reason when the score is
   released) and saves. In one transaction the server locks the milestone row (`SELECT … FOR
   UPDATE`, as F-08 does), reads the current score, applies the rules below, upserts
   `MilestoneScore` and appends a `ScoreChange` of kind `SET` (old value, new value, reason, who,
   when).
3. **Release:** after a confirmation dialog the server locks the row, checks that a score exists and
   is not yet released, sets `releasedAt` / `releasedById` and appends a `ScoreChange` of kind
   `RELEASE`.
4. Students of the team see the value on the milestone page once it is released. The score is
   **not** added to the milestone list or detail DTOs, the submission list or the F-10 board, so an
   unreleased value cannot leak through any Sprint 1–2 response; the score endpoint is the only place
   it is served.
5. A score can be set and released whatever the milestone's state (open, past its deadline, closed
   early by F-08, with or without revisions): grading often happens after the deadline.

### Check order

scope 404 (`loadMilestoneForUser`) → role 403 (writes: `SUPERVISOR` only; the scope already limits it
to an assigned supervisor, as for F-06 feedback) → request shape 400 → lock row → **state 409**
(release only) → **relative check 400** (compared with the locked row) → write.

| Step | Set / change (`PUT`) | Release (`POST …/release`) |
| --- | --- | --- |
| shape 400 | `fields.score`, `fields.reason` | — (no body is read) |
| state 409 | — | `NO_SCORE` → `ALREADY_RELEASED` |
| relative 400 | `NO_CHANGE` (same value as stored); `fields.reason` when the stored score is released and no valid reason is given | — |

Because the reason check runs **after** the lock, a change racing with a release is judged against
the release: if the release committed first, the change needs a reason.

### Rule functions (pure, unit-tested)

In `server/src/rules/score.ts`:

- `validateScoreInput(body)` → `{ ok: true, value: { score, reason } }` | `{ ok: false, fields }`.
  `score` must be a JSON **integer** from 0 to 100 (`"85"`, `85.5`, `-1`, `101`, `null`, missing →
  `fields.score` "Score must be a whole number from 0 to 100."). `reason` is optional here: when
  present it is trimmed, at most 500 characters, with no control characters other than tab, line
  feed and carriage return (`hasMultiLineControl`, `rules/text.ts`) → otherwise `fields.reason`
  "Reason must be at most 500 characters.". An empty or all-space reason counts as no reason.
- `checkScoreChange(stored, value)` with `stored: { score, releasedAt } | null` → `{ ok: true }` |
  `{ ok: false, noChange: true }` | `{ ok: false, fields }`. Same value as stored → `noChange`
  (whatever the reason). Stored and released, and the reason missing or shorter than 3 characters →
  `fields.reason` "A reason (3–500 characters) is required to change a released score.".
- `scoreViewFor(role, row)` → the response body for `GET …/score`: the full view for `SUPERVISOR`;
  for `STUDENT` `{ score: null }` unless released, otherwise `{ score: { value, releasedAt } }`.

## UI

- **Milestone page, Supervisor:** a **Score** panel below the milestone header.
  - Input "Score (0–100)", **Save**. Once released, a required "Reason for change" textarea appears
    and its label says why. Field errors show under the inputs and keep the typed values;
    `NO_CHANGE` and 409 show in the standard alert.
  - Status line: "Not released" or "Released 29 Nov 10:00 by Dr. Supervisor One" (Bangkok time,
    D-05). **Release score** is shown only when a score exists and is not released; it opens a
    dialog "Students of <team> will see this score. After release, every change needs a reason." with
    **Release** / **Cancel**.
  - **History:** one line per change — "85 → 90 · Regraded after appeal · Dr. Supervisor One ·
    29 Nov 11:00", "Released · …", "— → 85 · …". Empty state: "No score yet."
- **Milestone page, Student:** "Score: 90 / 100 (released 29 Nov 10:00)" or "Score not released
  yet." No input, button or history.
- Loading and error states for the panel follow NFR-10; a failed load shows `ErrorAlert` with
  **Retry** inside the panel without hiding the rest of the page.

## API

| Method & path | Request | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/milestones/:milestoneId/score` | — | 200 `{ score }` (shape depends on role) | 401, 404 |
| `PUT /api/milestones/:milestoneId/score` | `{ score, reason? }` | 200 `{ score: supervisorScore }` | 400, 401, 403, 404 |
| `POST /api/milestones/:milestoneId/score/release` | — | 200 `{ score: supervisorScore }` | 401, 403, 404, 409 |

- **`supervisorScore`**: `{ value, releasedAt, releasedBy: { id, name } | null, history:
  [scoreChange] }`, or `null` when no score has been set. Every response has
  `Cache-Control: no-store`.
- **Student view**: `{ score: null }` before release (also when no score exists, so a student cannot
  tell "not set" from "not released"); `{ score: { value, releasedAt } }` after release.
- **`scoreChange`**: `{ kind, oldValue, newValue, reason, by: { id, name }, at }`. `SET`: `oldValue`
  null for the first value; `RELEASE`: `oldValue`, `newValue` and `reason` null. Ordered by `at`
  descending, then id descending.
- **Errors** use the standard shape from `http.ts`:
  - 400 `VALIDATION_ERROR` "Please correct the highlighted fields." with `fields.score` /
    `fields.reason`; `NO_CHANGE` 400 "The score already has this value." with no `fields`.
  - 403 `FORBIDDEN` "Only an assigned supervisor can score this milestone." (a Student in scope).
  - 404 `NOT_FOUND` "Milestone not found." (out of scope, unknown, malformed ID, or an `ADMIN`,
    F-09).
  - 409 `NO_SCORE` "Set a score before releasing it."; `ALREADY_RELEASED` "This score has already
    been released."

## Data (additive only — the tagged Lab 6 revision shares the database)

- `MilestoneScore` (new): `id`, `milestoneId` FK **UNIQUE** (one score per milestone, and a milestone
  belongs to one team), `score Int`, `releasedAt Timestamptz?`, `releasedById Int?` (FK `User`),
  `createdAt`, `updatedAt` (timestamptz, app clock inside the transaction, after the lock).
  - CHECKs: `score BETWEEN 0 AND 100`; `(releasedAt IS NULL) = (releasedById IS NULL)`.
- `ScoreChange` (new): `id`, `milestoneScoreId` FK, `kind` (new enum `ScoreChangeKind`: `SET`,
  `RELEASE`), `oldScore Int?`, `newScore Int?`, `reason text?`, `changedById` FK, `changedAt`
  timestamptz (app clock, after the lock).
  - CHECKs: `kind = 'SET'` ⇒ `newScore` NOT NULL and `BETWEEN 0 AND 100`, and `oldScore` NULL or
    `BETWEEN 0 AND 100`; `kind = 'RELEASE'` ⇒ `oldScore`, `newScore` and `reason` NULL;
    `reason` length ≤ 500.
  - Index `(milestoneScoreId, changedAt)`.
- **Enforced in code only**, under the row lock and covered by tests: a `SET` whose stored score was
  already released has a reason of 3–500 characters (BR-12); `MilestoneScore.score` equals the
  latest `SET`'s `newScore`; `ScoreChange` rows are never updated or deleted (no API does so).
- **Migration:** `<UTC timestamp>_milestone_score`, on `sprint3-staging` after `v0.3.0`; migration
  order = merge order as in Sprint 2.
- **Known limit:** the tagged Lab 6 revision does not know these tables and never serves a score;
  nothing there changes.

**F-12 contract:** its `score` column is `MilestoneScore.score` and `score_released` is
`releasedAt IS NOT NULL` (`yes` / `no`), as F-12 already assumes. No change to F-12 is needed.

**Files expected to change:**
- `server/prisma/schema.prisma` + migration
- new `server/src/rules/score.ts`, `server/src/scores/routes.ts` (mounted under
  `/api/milestones/:milestoneId/score`)
- client: the Score panel on the milestone page and its API helpers
- `docs/srs.md` (D-10, Q-01), `docs/system-sds.md` (data model, routes), `docs/traceability.md`

## Acceptance criteria

| ID | Given / When / Then |
| --- | --- |
| AC-11-1 | Supervisor 1 sets 85 on an Alpha milestone → 200 with `value` 85, `releasedAt` null and one `SET` entry (— → 85, Supervisor 1, time). Setting 90 before release, without a reason → 200 and a second `SET` (85 → 90). |
| AC-11-2 | Before release, A1's `GET …/score` → 200 `{ score: null }`, and neither that body nor A1's milestone, milestone list, submission list (or, once merged, F-10 board) response contains the value. A milestone with no score gives A1 the same `{ score: null }`. |
| AC-11-3 | Supervisor 1 releases → 200 with `releasedAt` and `releasedBy`; A1 then gets `{ score: { value: 90, releasedAt } }` and no history or reason. Releasing again → 409 `ALREADY_RELEASED`; releasing a milestone with no score → 409 `NO_SCORE`. Nothing changes in either case. |
| AC-11-4 | After release: changing to 70 without a reason, with a 2-character reason, with only spaces, or with a NUL → 400 `fields.reason`, value unchanged; with "Regraded after appeal" → 200, a `SET` entry 90 → 70 with that reason, and A1 now sees 70 with the original `releasedAt`. Reasons of 3 and 500 characters are accepted, 501 → 400. |
| AC-11-5 | Score validation: `-1`, `101`, `85.5`, `"85"`, `null` and a missing score → 400 `fields.score`, nothing stored; `0` and `100` are accepted. Sending the stored value again → 400 `NO_CHANGE`. |
| AC-11-6 | A1 calls `PUT` and `POST …/release` → 403 each; Supervisor 2 and an `ADMIN` call `GET`, `PUT` and `POST` on the Alpha milestone → 404 each; malformed or unknown milestone IDs → 404; no session → 401. Nothing is stored. |
| AC-11-7 | The database rejects, when inserted directly: a `MilestoneScore` with score 101 or −1; one with `releasedAt` set and `releasedById` null; a second `MilestoneScore` for the same milestone; a `ScoreChange` `SET` with a null `newScore`; a `RELEASE` with a `newScore` or a reason. |
| AC-11-8 | Races: (a) two `PUT`s with different values at the same moment → both 200, two `SET` rows whose old/new values chain, and the stored value equals the later one; (b) a release and a reason-less change at the same moment → either the change is 200 and then the release, or the release is 200 and the change 400 `fields.reason`; never a released value changed without a reason. |
| AC-11-9 | A score can be set and released on a milestone whose deadline has passed and on one closed early (after F-08), with no submission at all. |
| AC-11-10 | UI: the Supervisor panel shows the input, field errors under it with values kept, `NO_CHANGE`/409 in the alert, **Release score** only when a score exists and is unreleased, the confirmation dialog (Cancel sends nothing), the required reason field after release, and the history; the Student sees only "Score not released yet." or the released value; the panel has loading and error states with Retry. |

## Software test specification (planned)

TEST-11-01 … TEST-11-11 and TEST-UI-11 in the Sprint 3 [sts.md](sts.md), with levels, inputs and
expected results. Each RED test is committed before its implementation. Logs go in
`artifacts/sprint-3/tdd/F-11-*.txt`.

## Definition of Done

The Sprint 1 [definition-of-done.md](../sprint-1/definition-of-done.md) applies, plus:
- [ ] D-10 is in `srs.md` and Q-01 points to it.
- [ ] The migration is additive only (two new tables and one new enum); the Lab 6 tagged revision
      still passes its health check and milestone list after `prisma migrate deploy`.
- [ ] Every CHECK listed under Data is in the migration SQL and covered by AC-11-7.
- [ ] Every AC-11-n has a passing test in the STS, with file › name and the tested commit. The
      traceability rows are filled in. TEST-04-*, TEST-05-*, TEST-06-* (and TEST-08-*, TEST-10-* once
      merged) pass unchanged.
- [ ] The PR is reviewed by Achirawit and merged into `sprint3-staging`, released as part of
      `v0.4.0-rc.1`, and the Issue moves to Done on the board.
