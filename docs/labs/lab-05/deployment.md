# Lab 5 deployment - CoursePM

This is the first deployment plan for issue #24. Record the final project ID,
region, resource names, release run and live URL after the first deployment (#27)
and automated release (#29). Do not put passwords or connection strings here.

## Stack and differences from the starter

CoursePM uses React 19, Vite and TypeScript for the client; Express 5 and
Prisma 7 for the API; and PostgreSQL for persistent data (version 18 locally;
record the Cloud SQL version chosen in #27). The Lab 5 starter
is a TokTickIT example, so its API routes, smoke checks, Docker build and seed
commands must be adapted to CoursePM. In production, Express serves the built
React client and `/api` from one origin. The Vite `/api` proxy is used only in
local development. Sessions live in PostgreSQL, and submissions store links,
not uploaded files. No required application data is stored only in the container.

The production image must place the compiled server at `server/dist` and the
built client at `client/dist`, or set `CLIENT_DIST_DIR` to the actual client
directory. Its web process starts the server only. A separate Cloud Run job
applies migrations with `prisma migrate deploy` and runs the idempotent seed
before the service revision is updated. A failed migration stops the release.

## Environment variables

`server/.env.example` is the committed template. `server/.env` is local and
ignored by Git. No real credential belongs in the repository, image, logs or
submission PDF. The client reads no environment variable at runtime and calls
relative `/api` URLs.

| Variable | Purpose | Secret? | Source |
| --- | --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection for API, migrations and seed | Yes | Local `server/.env`; Secret Manager in GCP |
| `DATABASE_URL_TEST` | Separate PostgreSQL database for integration tests | Yes | Local `server/.env`; temporary CI test database; never the live database |
| `PORT` | HTTP port listened to by Express | No | Local `server/.env`; Cloud Run runtime |
| `NODE_ENV` | Enables production cookies and static client serving | No | Local `server/.env`; production service configuration |
| `CLIENT_DIST_DIR` | Optional path to built React files; defaults to `client/dist` beside `server/` | No | Image layout, or service configuration if the layout differs |
| `SESSION_TTL_HOURS` | Session lifetime; defaults to 8 hours | No | Local `server/.env`; production service configuration |
| `SEED_PASSWORD` | Password for synthetic Student and Supervisor demo accounts | Yes | Local `server/.env`; Secret Manager for the migration/seed job in GCP |

The seed creates six Student and two Supervisor demo accounts. It uses
`SEED_PASSWORD` supplied at run time, upserts the records, and resets the demo
passwords when it runs again. Share demo credentials with the Lab 6 partner
team privately, never through this document or a screenshot.

## Local build, migration, seed and verification

Create separate empty PostgreSQL databases for development and tests. Copy
`server/.env.example` to `server/.env` and supply local values. Tests refuse to
run when `DATABASE_URL_TEST` points to the development database.

```sh
npm ci
npm --prefix server ci
npm --prefix client ci
npm --prefix server run db:deploy
npm --prefix server run db:seed
npm test
npm --prefix client run build
npm --prefix server run build
```

For local development run `npm --prefix server run dev` and
`npm --prefix client run dev` in separate terminals. Open
`http://localhost:5173`. For a production-mode local check, build the client
and server, set `NODE_ENV=production`, and start the compiled server with
`npm --prefix server start`. The server serves `/`, SPA routes, `/api/health`,
and `/api/ready` on `PORT`. `/api/ready` returns 503 if PostgreSQL cannot be
reached; `/api/health` remains a database-independent liveness check.

## GCP and release record (complete in #27-#29)

| Item | Value |
| --- | --- |
| GCP project ID | Record the team's new CoursePM project ID before #27 |
| Region | Decide and record before #27 |
| Artifact Registry repository | Decide and record before #27 |
| Cloud SQL instance and database | Decide and record before #27 |
| Cloud Run migration job and service | Decide and record before #27 |
| Public URL and running commit | Record after deployment |

The release path is a feature branch to `lab5-staging` by reviewed Pull
Request, then a reviewed release Pull Request to `main`. CI builds and tests
both Pull Requests. The deployment workflow on `main` will tag the image with
the full commit SHA, run the migration/seed job, update Cloud Run to that image
and run a read-only smoke check. Record the workflow run, image digest and
serving Cloud Run revision for each release so the running commit can be
identified. The exact commands and links will be added with #27 and #29.
