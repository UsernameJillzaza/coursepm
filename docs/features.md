# CoursePM — Feature inventory

Version 0.1 · 2026-11-15 · requirement IDs refer to [srs.md](srs.md).

| ID | Feature / responsibility | Description | Requirements | Depends on | Sprint |
| --- | --- | --- | --- | --- | --- |
| F-01 | Authentication and session | Login, logout, current user; inactive accounts rejected; scrypt hashes; HttpOnly session cookie with 8-hour expiry; seeded demo accounts. | FR-01, FR-02, BR-01, NFR-01, NFR-03, NFR-04 | — | 1 |
| F-02 | Access-scope enforcement (cross-cutting) | Middleware and query helpers that limit every team-owned record to members or assigned supervisors and enforce role-only operations. | BR-02, BR-03, NFR-02, NFR-07 | F-01 | 1 |
| F-03 | Teams and membership (seeded) | Team, membership and supervisor-assignment tables, seed script, "My teams" page and team detail with members. | FR-03, D-04, D-07, NFR-06 | F-01, F-02 | 1 |
| F-04 | Milestone creation and list | Supervisor creates a milestone for an assigned team; everyone with access lists the team's milestones with status. | FR-04, FR-05, BR-04, BR-05, D-05 | F-03 | 1 |
| F-05 | Submission with deadline and revision rules | Student submits/resubmits title, description and link; enforces the deadline and revision limit; lists revisions. | FR-06, FR-07, FR-08, BR-06, BR-07, BR-08, NFR-05, D-08 | F-04 | 1 |
| F-06 | Feedback on a revision | Assigned supervisor records feedback on one revision; team and supervisor read it beside that revision. | FR-09, FR-10, BR-09, BR-10 | F-05 | 1 |
| F-07 | Revision history and comparison | Full history page with a side-by-side comparison of two revisions. | FR-11 | F-05 | 2 |
| F-08 | Milestone maintenance and extensions | Edit or close a milestone with an audit record; per-team deadline extension. | FR-12, FR-13, BR-11 | F-04 | 2 |
| F-09 | Course administration | Administrator role and screens to create teams, assign people and deactivate accounts. | FR-14, BR-01 (`ADMIN`) | F-03 | 2 |
| F-10 | Team progress board | Per-team board of milestone states with drill-down. | FR-15, NFR-08 | F-05, F-06 | 2 |
| F-11 | Milestone scoring and release | Scores 0–100, release control, change reason. | FR-16, BR-12, Q-01 | F-06 | 3 |
| F-12 | Supervisor summary and export | Cross-team summary metrics and CSV export. | FR-17, FR-18 | F-10, F-11 | 3 |
| R-01 | Delivery responsibility | Sprint 1 scaffold: health endpoint and separate test-database configuration. Lab 5: Docker image, CI checks and GCP deployment. | NFR-01, NFR-06, NFR-07, NFR-09 | Scaffold before F-01; deployment after F-01 … F-06 | 1 (scaffold), 2 (Lab 5) |
| R-02 | UI conventions | Shared form validation, loading/empty/error components. | NFR-10 | — | 1, kept in every sprint |
