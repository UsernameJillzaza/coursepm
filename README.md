# CoursePM — Course Project Management System

CPE334 group project (theme 6), team TH-042_P6. Student teams submit milestone work; supervisors set milestones and give feedback on each submitted revision.

## Documents
- [SRS](docs/srs.md) · [Feature inventory](docs/features.md) · [Traceability](docs/traceability.md)
- [System-Level SDS](docs/system-sds.md) · [Three-sprint plan](docs/sprints/plan.md)
- Sprint 1: [feature contracts, STS, Definition of Done, Issue plan](docs/sprints/sprint-1/)

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
4. Run the app in two terminals, then open http://localhost:5173 (the page shows `API status: connected` when the API is up):
   ```bash
   npm --prefix server run dev
   npm --prefix client run dev
   ```

After pulling F-01 (Issue #4), apply the migrations to your development database:
```bash
npm --prefix server run db:deploy
```
Login, logout and the session cookie work from F-01. The demo accounts and teams are loaded by the seed, which arrives with F-03 (Issue #5); until then the API tests create their own accounts.

## Tests
| Command | What it runs |
| --- | --- |
| `npm run test:server` | Vitest + Supertest against `DATABASE_URL_TEST` (checked to be a separate database, then migrated) |
| `npm run test:client` | Vitest + React Testing Library component tests |
| `npm --prefix client run build` | Type-check and production build of the client |
| `npm run test:e2e` | Playwright journeys in Edge (journeys arrive with the features) |
