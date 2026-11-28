# CoursePM — Software Requirements Specification (SRS)

| Field | Value |
| --- | --- |
| Product | CoursePM (Course Project Management System), CPE334 theme 6 |
| Team | TH-042_P6: `<Student A name, ID>` · `<Student B name, ID>` |
| Version | 0.1, Sprint 1 baseline, 2026-11-15 |
| Status | Draft for team review |

## 1. Stakeholder problem and context

In CPE-style project courses, student teams hand in milestone work (proposals, design documents, sprint
releases) through chat groups, e-mail and shared drives. Supervisors cannot see in one place which
team submitted what, for which milestone, by when, and what feedback was given on which version. Late
work and silent resubmissions cause disputes, because nothing records the submission time or the
version a comment referred to.

**Chosen context.** One university course with several two-to-four-person student teams. Each team is
supervised by one or more faculty supervisors. A supervisor defines milestones for each team they
supervise, the team submits work for each milestone before its deadline, and the supervisor gives
written feedback on a specific submitted revision.

## 2. Actors and responsibilities

| Actor | Responsibilities | Sprint |
| --- | --- | --- |
| **Student** (team member) | Sign in; view own team(s) and their milestones; submit and resubmit milestone work before the deadline; read feedback on own team's submissions. | 1 |
| **Supervisor** | Sign in; view assigned teams; create milestones (title, description, deadline, revision limit) for an assigned team; read that team's submissions; record feedback on a submitted revision. | 1 |
| **Course Administrator** | Create teams, assign students and supervisors, deactivate accounts. Done by the seed script in Sprint 1. | 2 |
| System | Enforces authentication, role permissions, record scope, deadlines and revision limits; stores timestamps. | 1 |

## 3. Scope and exclusions

**In scope (whole product):** accounts and sessions; teams, membership and supervisor assignment;
milestones with deadlines and revision policy; submissions with revision history; feedback; milestone
scoring; a team progress board; supervisor summary views.

**Explicit exclusions:** self-registration, password recovery, e-mail verification, multiple roles per
account (spec §5.2); file uploads (a submission is a link to the team's own storage such as GitHub or a
drive); e-mail, LINE or other external notifications; plagiarism checking; integration with LEB2 or
the university registration system; real student data (only synthetic demo data is used).

## 4. Functional requirements (FR)

| ID | Requirement | Sprint |
| --- | --- | --- |
| FR-01 | A user signs in with e-mail and password and receives a session; invalid credentials are rejected with one generic message. | 1 |
| FR-02 | A signed-in user can retrieve their own identity (id, name, e-mail, role) and sign out, which ends the session on the server. | 1 |
| FR-03 | A user sees the teams they belong to (Student) or supervise (Supervisor), with the members of each team. | 1 |
| FR-04 | A Supervisor creates a milestone for an assigned team with a title, description, deadline and maximum number of revisions. | 1 |
| FR-05 | Users list the milestones of a team they may access, ordered by deadline, with each milestone's submission status. | 1 |
| FR-06 | A Student submits work for a milestone of their team as a title, description and link. | 1 |
| FR-07 | A Student resubmits work for the same milestone before the deadline; each resubmission is stored as a new revision and earlier revisions are kept unchanged. | 1 |
| FR-08 | Users view a milestone's submissions (latest revision first) with their submitter and submission time. | 1 |
| FR-09 | A Supervisor records written feedback on a specific submission revision of an assigned team. | 1 |
| FR-10 | Team members and assigned supervisors view feedback together with the revision it refers to. | 1 |
| FR-11 | Users view the full revision history of a milestone and compare two revisions side by side. | 2 |
| FR-12 | A Supervisor edits a milestone's description and deadline, or closes it early; every change is recorded with who made it and when. | 2 |
| FR-13 | A Supervisor grants one team a deadline extension for one milestone. | 2 |
| FR-14 | A Course Administrator creates teams, assigns students and supervisors, and deactivates accounts. | 2 |
| FR-15 | A team progress board shows each milestone's state: Not submitted, Submitted, Feedback given, Overdue, Closed. | 2 |
| FR-16 | A Supervisor records a score (0–100) for a team's milestone; the team sees the score only after it is released. | 3 |
| FR-17 | A Supervisor sees a summary across all assigned teams: on-time rate, overdue milestones, submissions awaiting feedback. | 3 |
| FR-18 | A Supervisor exports a team's milestone/submission/feedback record as CSV. | 3 |

## 5. Business rules (BR)

| ID | Rule | Sprint |
| --- | --- | --- |
| BR-01 | Every account has exactly one role: `STUDENT` or `SUPERVISOR` (`ADMIN` added in Sprint 2). | 1 |
| BR-02 | A Student may access only teams they are a member of, and those teams' milestones, submissions and feedback. | 1 |
| BR-03 | A Supervisor may access only teams they are assigned to, and those teams' milestones, submissions and feedback. | 1 |
| BR-04 | Only a Supervisor assigned to the team may create a milestone for it. Students can never create milestones. | 1 |
| BR-05 | A milestone needs a title of 3–120 characters, a description of at most 2,000 characters, a deadline that is in the future when it is created, and a revision limit of 1–5 (default 3). | 1 |
| BR-06 | **Deadline rule.** A submission is accepted only while the current server time is at or before the milestone deadline. Later submissions are rejected and nothing is stored. The server time is used, never a time sent by the client. | 1 |
| BR-07 | **Revision rule.** A team's revisions for one milestone are numbered 1, 2, 3 … with no gaps. A team may not exceed the milestone's revision limit; the extra submission is rejected and nothing is stored. Stored revisions are never edited or deleted. | 1 |
| BR-08 | A submission needs a title of 3–120 characters, a description of at most 2,000 characters, and an absolute `http` or `https` link of at most 2,048 characters. | 1 |
| BR-09 | Only a Supervisor assigned to the team may record feedback. Students can never record feedback. | 1 |
| BR-10 | Feedback belongs to exactly one submission revision. Each revision has at most one feedback record in Sprint 1; feedback text is 1–4,000 characters. | 1 |
| BR-11 | A deadline extension applies to one team and one milestone, and must be later than the current deadline. | 2 |
| BR-12 | A score is visible to students only after the supervisor releases it; released scores can be changed only with a recorded reason. | 3 |

## 6. Non-functional requirements (NFR)

| ID | Requirement and measurable target | Verification method | Sprint |
| --- | --- | --- | --- |
| NFR-01 | **Authentication.** Every API route except `POST /api/auth/login`, the public `GET /api/health` and `GET /api/ready` probes, and the idempotent `POST /api/auth/logout` (204 even without a session) returns 401 without a valid session, with no private data in the body. | API tests on every protected route group and the public probes | 1; readiness added in Lab 5 |
| NFR-02 | **Authorization is server-side.** Out-of-scope records return 404 (their existence is not revealed); wrong-role operations return 403. Hiding a button is never the only control. | API tests: other team's submission, student creates milestone, student records feedback | 1 |
| NFR-03 | **Password storage.** Passwords are stored only as salted scrypt hashes; no API response contains a password or a hash. | Unit test on the hash format + API test on the response shapes | 1 |
| NFR-04 | **Session lifecycle.** Sessions are random 32-byte tokens in an `HttpOnly`, `SameSite=Lax` cookie, stored only as a SHA-256 hash, and expire after 8 hours; logout deletes the server-side session. Inactive accounts cannot log in, and an existing session of an account that becomes inactive is rejected on its next request. | API tests: logout then reuse cookie → 401; expired session → 401 | 1 |
| NFR-05 | **Data integrity.** Revision numbers are unique per milestone (a milestone belongs to exactly one team) through a database constraint, so two simultaneous submissions cannot both become the same revision. | Integration test with two concurrent submissions | 1 |
| NFR-06 | **Persistence.** All data is in PostgreSQL and survives an application restart; the schema is created only through Prisma migrations and the demo data through a repeatable seed. | Restart check + `prisma migrate reset` in the setup check | 1 |
| NFR-07 | **Safe errors.** Errors return `{ "error": { "code", "message", "fields?" } }` without stack traces or SQL. | API tests on validation and 500 paths | 1 |
| NFR-08 | **Responsiveness.** With seed data, the main list endpoints answer in under 500 ms at the 95th percentile on a developer laptop. | Performance smoke test (50 requests) | 2 |
| NFR-09 | **Deployability.** All configuration comes from environment variables; the app runs in Docker and connects to Cloud SQL on GCP. | Lab 5 container and deployment checks | 2 (Lab 5) |
| NFR-10 | **Usability.** Every form shows field-level validation messages and every list has loading, empty and error states. | UI component tests + manual check | 1 |

## 7. Assumptions, decisions and open questions

| ID | Item | Resolution |
| --- | --- | --- |
| D-01 | The spec allows "deadline **or** revision rule"; we use **both** (BR-06, BR-07). Together they cover the stakeholder's two disputes (late work and silent resubmission). | Decided by the team |
| D-02 | A submission is a link, not an uploaded file (exclusion in §3). This keeps Sprint 1 small and avoids storing student files. | Decided by the team |
| D-03 | Out-of-scope records return **404**, not 403, so a student cannot discover another team's IDs (NFR-02). Wrong-role operations on an accessible record return 403. | Decided by the team |
| D-04 | Sprint 1 has no Administrator screens; teams, membership and supervisor assignment come from the seed script (spec §5.2 allows seeded accounts). | Decided by the team |
| D-05 | Deadlines are stored in UTC and shown in Asia/Bangkok time. The deadline is inclusive (a submission at exactly the deadline is accepted). | Decided by the team |
| D-06 | Late submission is never accepted in Sprint 1. Extensions (FR-13) are how late work is allowed, from Sprint 2. | Decided by the team |
| D-07 | A student may belong to several teams (for example two courses), so membership is many-to-many. | Decided by the team |
| D-08 | Any team member may submit for the team; the submitter is recorded on each revision. | Decided by the team |
| D-09 | Because a milestone belongs to one team, FR-12 and FR-13 are kept as separate audited actions (refines BR-11 and D-06). An **FR-12 edit** corrects the description or deadline and is allowed only while the deadline has not passed, there is no extension and there is no submission. **Close early** stops submissions. An **FR-13 extension** needs a reason, can only move the deadline later (BR-11), and is possible before or after the deadline. The original deadline stays visible, so late work allowed by D-06 traces to an extension. Contract: [sprints/sprint-2/F-08-milestone-maintenance.md](sprints/sprint-2/F-08-milestone-maintenance.md). | Decided by the team (2026-11-28, PR #72 review) |
| D-10 | Answers Q-01. Feedback stays visible to the team as soon as it is saved (the Sprint 1 behaviour); only the **score** is held back until the supervisor releases it (BR-12). Feedback is formative, so the team needs it before the next revision; the score is the summative judgement. Contract: [sprints/sprint-3/F-11-scoring-release.md](sprints/sprint-3/F-11-scoring-release.md). | Decided by the team (2026-11-28, Issue #73); the TA was not asked |
| Q-01 | Should students see feedback the moment it is saved, or only after release (like scores)? | Sprint 1: immediately. **Resolved by D-10** (2026-11-28): feedback stays immediate; only scores wait for release. |
| Q-02 | Is a revision limit per milestone acceptable to the stakeholder, or should it be course-wide? | Per milestone (more flexible). Confirm with the TA. |
