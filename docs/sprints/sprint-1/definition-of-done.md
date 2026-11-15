# Product Definition of Done

Applies to every feature and to every sprint release. A feature is **Done** only when all of these
have evidence; an AI agent saying it works is not evidence.

1. **Contract first.** The feature contract (behavior, UI/API/data, AC) and its STS rows were committed
   before the implementation commits, and any later change is visible in the history with a reason.
2. **Behavior implemented** for every AC, including the negative, boundary and role cases.
3. **Planned verification executed.** Every AC has at least one automated test at a suitable level, and
   it passes. Rule work shows a failing test before the fix and a passing one after (TDD). No required
   test is skipped, weakened or deleted to get a green run.
4. **Reviewed.** A PR into `sprint1-staging` linked to the Issue (`Closes #n`), approved by the
   teammate with a specific comment (a check, question or finding). Authors never approve their own PR.
5. **Integrated.** Merged into sprint staging; the full suite (server, client, E2E) passes there; then a
   reviewed release PR merges staging into `main` and the release is tagged.
6. **Docs and setup current.** README setup steps work on a fresh clone (install → migrate → seed →
   test → run); `.env.example` lists every variable; traceability results are filled in.
7. **Honest status.** Incomplete work, known defects and failed/skipped tests are listed in the release
   notes and in Part F.
8. **No secrets** in Git, the client bundle, screenshots or the PDF.
