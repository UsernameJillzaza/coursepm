# F-06 Feedback on a revision — feature contract

Version 1.0 · 2026-11-15 · Issue: #2 (contract); implementation: #8 · Links: FR-09, FR-10, BR-09, BR-10

## Behavior and workflow
1. An assigned Supervisor opens a milestone and, under a revision without feedback, writes feedback and
   clicks **Save feedback**.
2. The server: load the submission in scope (404) → role must be `SUPERVISOR` (403) → body trimmed 1–4,000
   characters with no control character other than tab, line feed or carriage return (400; the control-character
   check is Lab 6, Issue #63) → insert `Feedback { submissionId, supervisorId, body }`. If the revision already has
   feedback (unique constraint) → 409 `FEEDBACK_EXISTS`.
3. Feedback is returned inside each submission of the F-05 list, so it always appears next to **the
   revision it refers to** (the submission/feedback association is preserved). A later resubmission
   doesn't move it.

## UI
Each revision card shows its feedback (supervisor name, time, text) or, for supervisors only, a textarea
with **Save feedback**. A 400 response shows the message beside the textarea and preserves the entered
text. Students see "No feedback yet".

## API
| Method & path | Request | Success | Errors |
| --- | --- | --- | --- |
| `POST /api/submissions/:submissionId/feedback` | `{ body }` | 201 `{ feedback: { id, submissionId, body, createdAt, supervisor:{id,name} } }` | 400, 401, 403, 404, 409 |

## Data
`Feedback` (submissionId FK **unique**, supervisorId FK, body text, createdAt). Migration
`<timestamp>_feedback`.

## Acceptance criteria
| ID | Given / When / Then |
| --- | --- |
| AC-06-1 | Supervisor 1 records feedback on Alpha revision 1 → 201; it is stored with that `submissionId`. |
| AC-06-2 | A student of Alpha posting feedback → 403; nothing is stored. |
| AC-06-3 | Supervisor 2 (not assigned to Alpha) posting feedback on an Alpha submission → 404. |
| AC-06-4 | An Alpha student listing the submissions sees the feedback attached to revision 1, and still on revision 1 after revision 2 is submitted. |
| AC-06-5 | Second feedback on the same revision → 409 `FEEDBACK_EXISTS`; an empty body or one over 4,000 characters → 400. |
| AC-06-6 | In the feedback form, a 400 response shows a message beside the textarea and keeps the entered text. |
