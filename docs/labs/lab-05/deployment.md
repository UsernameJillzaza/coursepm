# Lab 5 deployment - CoursePM

This plan now includes the proposed first deployment resources for issue #27.
Record the release run and live URL after the first deployment and automated
release (#29). Do not put passwords or connection strings here.

## Stack and differences from the starter

CoursePM uses React 19, Vite and TypeScript for the client; Express 5 and
Prisma 7 for the API; and PostgreSQL for persistent data (version 18 locally;
record the Cloud SQL version chosen in #27). The Lab 5 starter
is a TokTickIT example, so its API routes, smoke checks, Docker build and seed
commands must be adapted to CoursePM. In production, Express serves the built
React client and `/api` from one origin. The Vite `/api` proxy is used only in
local development. Sessions live in PostgreSQL, and submissions store links,
not uploaded files. No required application data is stored only in the container.

The production image (root `Dockerfile`, #25) places the compiled server at
`/app/server/dist` and the built client at `/app/client/dist`, which is the
default `CLIENT_DIST_DIR` resolves to, so the variable is not set in the image.
Its web process starts the server only. A separate Cloud Run job
applies migrations with `prisma migrate deploy` and runs the idempotent seed
before the service revision is updated. A failed migration stops the release.

## Environment variables

There are two committed templates. The root `.env.example` is for
`docker compose up` (#25): it holds the PostgreSQL container settings,
`SEED_PASSWORD`, `SESSION_TTL_HOURS` and `APP_PORT`, and Compose builds
`DATABASE_URL` from it. `server/.env.example` is for running the server and
tests directly with Node. Both copies (`.env`, `server/.env`) are local and
ignored by Git and by `.dockerignore`. No real credential belongs in the repository, image, logs or
submission PDF. The client reads no environment variable at runtime and calls
relative `/api` URLs.

| Variable | Purpose | Secret? | Source |
| --- | --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection for API, migrations and seed | Yes | Local `server/.env`; built by Compose from the root `.env`; Secret Manager in GCP |
| `DATABASE_URL_TEST` | Separate PostgreSQL database for integration tests | Yes | Local `server/.env`; temporary CI test database; never the live database |
| `PORT` | HTTP port listened to by Express | No | Local `server/.env`; Cloud Run runtime |
| `NODE_ENV` | Enables production cookies and static client serving | No | Local `server/.env`; production service configuration |
| `DB_POOL_MAX` | Maximum PostgreSQL connections per server process; Cloud Run job/service use 3 | No | Optional locally; set by the #27 deploy script in Cloud Run |
| `CLIENT_DIST_DIR` | Optional path to built React files; defaults to `client/dist` beside `server/` | No | Image layout, or service configuration if the layout differs |
| `SESSION_TTL_HOURS` | Session lifetime; defaults to 8 hours | No | Local `server/.env`; production service configuration |
| `SEED_PASSWORD` | Password for synthetic Student and Supervisor demo accounts | Yes | Local `server/.env` or root `.env`; Secret Manager for the migration/seed job in GCP |

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

## Docker: fresh clone (C-03)

The root `Dockerfile` is a multi-stage build on `node:24-alpine`: it builds the
client, builds the server (`prisma generate` and `tsc`), then copies into the
final stage the compiled server and client plus what the migrate/seed step needs
(`node_modules`, `src/` for the `tsx` seed and the generated Prisma client,
`prisma/` and `prisma.config.ts`). The final stage runs `node dist/server.js` as
the non-root `node` user on port 3000. No build-time secret or `.env` file goes
into the image. `docker-compose.yml` runs three services in
order: `db` (PostgreSQL 18, health-checked), `migrate` (the same image running
`prisma migrate deploy` and the idempotent seed, then exiting), and `app`, which
starts only after `migrate` exits successfully and reports healthy once
`/api/ready` answers 200. Data persists in the `pgdata` volume until
`docker compose down -v`. Open `http://localhost:<APP_PORT>`, not a LAN IP: the
image runs with `NODE_ENV=production`, so the session cookie is `Secure`, which
browsers accept over plain HTTP only on `localhost`.

```sh
git clone https://github.com/UsernameJillzaza/coursepm.git && cd coursepm
cp .env.example .env        # replace the placeholders
docker compose up --build -d
docker compose ps -a        # migrate: Exited (0); db: healthy; app: healthy
curl -s "http://localhost:$(docker compose port app 3000 | sed 's/.*://')/api/ready"
docker compose down -v      # stop and delete the local database
```

The host port is `APP_PORT` from `.env` (default 3000); `docker compose port app 3000`
prints the one Compose actually published, so the `curl` works for any value.
`scripts/verify-c03.sh` runs every C-03 check in one go (no-`.env` build, image
secret checks, Compose status, health and readiness, sign-in, shutdown time). Each
required check prints `PASS` or `FAIL`, and the script exits 1 if any fails (2 if
`.env` is missing), so a failure cannot be mistaken for a pass. `.env` is moved
aside only for the no-`.env` build and is put back on any exit, including Ctrl+C.
It prints only statuses and API bodies, never the `.env`, passwords, connection
strings or cookies. Run it with a redirect, not `| tee`, so `$?` is the script's
own exit status:

```sh
sh scripts/verify-c03.sh > c03-run.txt 2>&1; echo "exit $?"
```

The server handles `SIGTERM` (sent by `docker compose stop`/`down` and by Cloud
Run on scale-in or a new revision): it stops accepting connections, lets open
requests finish, disconnects Prisma and exits, with an 8-second limit inside the
runtime's 10-second grace period. Without it, `node` as PID 1 ignored the signal
and was killed after 10 seconds.

**C-03 evidence.** The output of `scripts/verify-c03.sh` from a fresh clone in
Cloud Shell, with only the `.env.example` values and `APP_PORT=8080`, is in
[c03-run.txt](c03-run.txt); its first line is the tested commit. That run
started from an empty Docker image and build cache. An earlier run at `ed62ccc`
on a newly provisioned VM reported `docker build` exit 1 with its log discarded,
so its cause is unknown; the script now prints the log tail on failure, and the
cold-cache rerun above passed.

## Pull request CI (C-01)

`.github/workflows/ci-docker.yml` runs the `test-and-docker` job for Pull
Requests into `main` and any `*-staging` branch. It also supports a manual run
and can be called by the later deployment workflow. The job uses a temporary
PostgreSQL 18 service on the GitHub-hosted runner. It creates a separate
`coursepm_ci_test` database before running tests; `DATABASE_URL` points to
`coursepm_ci` for migration and seed, while `DATABASE_URL_TEST` points to the
test database. The server test setup verifies that the URLs select different
databases before it migrates or writes test data. CI generates the demo seed
password at run time; it does not read either local `.env` file or use Cloud SQL.
It masks the generated seed password before exporting it to later steps.

The required check installs dependencies, migrates and seeds, runs server and
client tests, type-checks the server, builds the client, and builds the Docker
image without publishing it. Its test counts and Docker result must be checked
on both the feature Pull Request into `lab5-staging` and the release Pull
Request into `main` before claiming C-01 is complete. Dependabot checks for
GitHub Actions and npm updates in the root, `server/`, and `client/` manifests.

Issue #26 feature PR [#34](https://github.com/UsernameJillzaza/coursepm/pull/34)
into `lab5-staging` triggered the
[`test-and-docker` run 44377184003](https://github.com/UsernameJillzaza/coursepm/actions/runs/44377184003)
on head commit `5fd0f04c086731fba0c6e6839bc584f51724903c`. The check passed:
server tests 119/119 (14 files), client tests 39/39 (6 files), migration and
seed succeeded (8 demo accounts and 3 teams), and the Docker image built.
This run predates the seed-password masking fix. The later
[#34 run 44380614259](https://github.com/UsernameJillzaza/coursepm/actions/runs/44380614259)
passed at `1633ff5be2dba632053e566e7f1d733fb93ab962` with the same counts and
Docker result; subsequent step logs show `SEED_PASSWORD: ***`. The
[#35 release PR run 44385838689](https://github.com/UsernameJillzaza/coursepm/actions/runs/44385838689)
also passed on `94145357ddf2084955862383aec0cdb01a88885a`: server 119/119,
client 39/39, and `coursepm:ci` built. This completes both C-01 PR checks
for that release head.

Playwright E2E is not part of `test-and-docker`: the current configuration uses
Microsoft Edge, while this job runs on Ubuntu. The E2E journeys also create
demo records in the seeded development database and rewrite Sprint 1 screenshot
artifacts. They remain a separate local check (`npm run test:e2e`) when that
side effect is needed. CI still runs the server integration tests against its
isolated test database, the client tests, and the production Docker build.

## GCP and release record (complete in #27-#29)

| Item | Value |
| --- | --- |
| GCP project ID | `cpe334-2026-th042-coursepm` (verified in Issue #23 Cloud Shell evidence; confirm active project before running) |
| Region | `asia-southeast1` proposed for owner review; pass `REGION` explicitly |
| Artifact Registry repository | `coursepm` (Docker) |
| Cloud SQL instance and database | `coursepm-pg` (PostgreSQL 16, Enterprise, `db-f1-micro`, 10 GB SSD, storage auto-increase off); database and user `coursepm` |
| Runtime service account | `coursepm-runner@cpe334-2026-th042-coursepm.iam.gserviceaccount.com` |
| Secret Manager | `coursepm-db-password`, `coursepm-database-url`, `coursepm-seed-password` |
| Cloud Run migration job and service | `coursepm-migrate` and `coursepm`; service min 0, max 3, port 3000, DB pool max 3 per process |
| Public URL and running commit | Record after deployment |

### First manual deployment (#27)

`deploy/deploy.sh` is adapted from the Student Guide starter. From the repo
root, set `PROJECT_ID` to the verified value above and `REGION` to the
reviewed region. In Cloud Shell, preview with:

```bash
PROJECT_ID=cpe334-2026-th042-coursepm REGION=asia-southeast1 DRY_RUN=1 bash deploy/deploy.sh
```

The captured [C-27 dry-run plan](c27-dry-run.txt) was generated locally from
script commit `dfed809e26032ff3365a76a4332169296f2c77b8`, with no
`gcloud` installation available. Its image tag is that commit; rerun the
preview from the reviewed Cloud Shell checkout before the real deployment.

The dry run does not invoke `gcloud`, generate credentials, or provision
resources. It prints the intended commands with redacted password placeholders.
The GCP owner and reviewer must read that output together, checking the
project, region, SQL tier and storage setting, IAM bindings, secret names,
migration command, image tag, public access, and scaling. Cloud Build's
default build identity can vary by project; verify its Artifact Registry push
access before the real run and review any IAM correction separately. Do not
paste a real password or `DATABASE_URL` into a PR, terminal log, screenshot,
or PDF.

After review, merge the script through `lab5-staging` and a reviewed release
PR into `main`. From a clean Cloud Shell checkout of that `main` commit,
the owner reads each resource-changing command in the approved script and
runs:

```bash
PROJECT_ID=cpe334-2026-th042-coursepm REGION=asia-southeast1 bash deploy/deploy.sh
```

The script enables APIs, creates the image repository, Cloud SQL database,
dedicated runtime identity, and three secrets, then builds a commit-tagged
image. `.gcloudignore` keeps local `.env` files and other ignored content out
of the source archive sent by `gcloud builds submit`; `.dockerignore`
separately controls the Docker build context. Before any resource change, the
script checks the upload list and stops if it contains a `.env` file. It
executes the migrate/seed Cloud Run job before deploying the public
service. It refuses partial DB credential state rather than silently changing
the database password on retry. The runtime identity gets Cloud SQL Client
on the project and Secret Accessor only on the URL and seed secrets.

After the owner-run deployment, record the deployed commit, image digest,
serving revision, public URL, `/api/health` and `/api/ready` results, and a
seeded-user UI sign-in in this document. The owner can retrieve the seed
password privately from Secret Manager for the sign-in check. Keep evidence
screenshots free of credentials. The image is built from `main`; subsequent
releases use the automated pipeline in #29.

The release path is a feature branch to `lab5-staging` by reviewed Pull
Request, then a reviewed release Pull Request to `main`. CI builds and tests
both Pull Requests. The deployment workflow on `main` will tag the image with
the full commit SHA, run the migration/seed job, update Cloud Run to that image
and run a read-only smoke check. Record the workflow run, image digest and
serving Cloud Run revision for each release so the running commit can be
identified. The exact commands and links will be added with #27 and #29.
