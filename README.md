# CoursePM — Course Project Management System

CPE334 group project (theme 6), team TH-042_P6. Student teams submit milestone work; supervisors set milestones and give feedback on each submitted revision.

## Documents
- [SRS](docs/srs.md) · [Feature inventory](docs/features.md) · [Traceability](docs/traceability.md)
- [System-Level SDS](docs/system-sds.md) · [Three-sprint plan](docs/sprints/plan.md)
- Sprint 1: [feature contracts, STS, Definition of Done, Issue plan](docs/sprints/sprint-1/) · [release notes (v0.1.0)](docs/sprints/sprint-1/release-notes.md)
- Sprint 1 evidence: [release-candidate test run](artifacts/sprint-1/test-runs/sprint1-release-run.txt) · [screenshots](artifacts/sprint-1/screenshots/) · [TDD logs](artifacts/sprint-1/tdd/)

## Requirements
Node.js 24, PostgreSQL 18 running locally, Microsoft Edge (used by the Playwright tests).

## Setup
1. Install dependencies (the server's `postinstall` generates the Prisma client):
   ```bash
   npm install
   npm --prefix server install
   npm --prefix client install
   ```
2. Create two empty PostgreSQL databases, one for development and one for the tests (for example with `psql -U postgres`):
   ```sql
   CREATE DATABASE coursepm;
   CREATE DATABASE coursepm_test;
   ```
3. Copy `server/.env.example` to `server/.env` and fill in your PostgreSQL user and password. `DATABASE_URL_TEST` **must name a different database** from `DATABASE_URL`: the tests refuse to start otherwise, so they can never migrate or write your development data. `.env` is git-ignored; never commit it.
4. Apply the migrations to your development database:
   ```bash
   npm --prefix server run db:deploy
   ```
5. Load the synthetic demo data (8 accounts, 3 teams). Every demo account uses the `SEED_PASSWORD` from your `server/.env`, and the seed is safe to run again:
   ```bash
   npm --prefix server run db:seed
   ```
6. Run the app in two terminals, then open http://localhost:5173 (the page shows `API status: connected` when the API is up) and log in with a demo account below:
   ```bash
   npm --prefix server run dev
   npm --prefix client run dev
   ```

## Demo accounts (synthetic)
| E-mail | Role | Team |
| --- | --- | --- |
| `supervisor1@coursepm.test` | Supervisor | Team Alpha |
| `supervisor2@coursepm.test` | Supervisor | Team Beta, Team Gamma |
| `alpha1@coursepm.test`, `alpha2@coursepm.test` | Student | Team Alpha |
| `beta1@coursepm.test`, `beta2@coursepm.test` | Student | Team Beta |
| `gamma1@coursepm.test`, `gamma2@coursepm.test` | Student | Team Gamma |

## Tests
| Command | What it runs |
| --- | --- |
| `npm run test:server` | Vitest + Supertest against `DATABASE_URL_TEST` (checked to be a separate database, then migrated) |
| `npm run test:client` | Vitest + React Testing Library component tests |
| `npm --prefix client run build` | Type-check and production build of the client |
| `cd server && npx tsc --noEmit` | Type-check of the server |
| `npm run test:e2e` | Playwright journeys in Edge against the seeded development database (starts both dev servers if they aren't running). Run `db:seed` first; each run adds a "Design review <timestamp>" milestone to Team Alpha and rewrites the screenshots in `artifacts/sprint-1/screenshots/` |
