# Lab 5 deployment - CoursePM

This document records the first manual deployment from `main` for issue #27.
The automated release procedure and its run evidence follow in #29. Do not
put passwords or connection strings here.

## Stack and differences from the starter

CoursePM uses React 19, Vite and TypeScript for the client; Express 5 and
Prisma 7 for the API; and PostgreSQL for persistent data (version 18 in Compose
and CI, version 16 in Cloud SQL). Cloud SQL uses PostgreSQL 16 with the chosen
small Enterprise `db-f1-micro` tier. The current migrations use enums, tables,
indexes and foreign keys without PostgreSQL 17/18-only features; future
migrations must remain compatible with 16. The Lab 5 starter
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
and is reused by `deploy.yml` (#29) before every release. The job uses a temporary
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

## GCP and release record (#27–#29)

| Item | Value |
| --- | --- |
| GCP project ID | `cpe334-2026-th042-coursepm` (verified in Issue #23 Cloud Shell evidence; confirm active project before running) |
| Region | `asia-southeast1` (Singapore; approved in the #27 Cloud Shell dry-run review) |
| Artifact Registry repository | `coursepm` (Docker) |
| Cloud SQL instance and database | `coursepm-pg` (PostgreSQL 16, Enterprise, `db-f1-micro`, 10 GB SSD, storage auto-increase off); database and user `coursepm` |
| Runtime service account | `coursepm-runner@cpe334-2026-th042-coursepm.iam.gserviceaccount.com` |
| Secret Manager | `coursepm-db-password`, `coursepm-database-url`, `coursepm-seed-password` |
| Cloud Run migration job and service | `coursepm-migrate` and `coursepm`; service min 0, max 3, port 3000, DB pool max 3 per process |
| Public URL | [CoursePM](https://coursepm-7cxt6io2na-as.a.run.app/) |
| Running commit | Changes with every release: read it from the page footer or the latest Deploy to Cloud Run run summary (see *How to find the running commit*) |
| Releases recorded here | #27 manual deployment: `de9213ebf000c224c44bab66b9990f99119c81ab`, revision `coursepm-00001-6hh`. First automated release (#29): `a36ed20e0b6ed7f5823943f84e7cffb9c73c0aa5`, revision `coursepm-00002-xvc` (record at the end) |

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

### First deployment record (#27)

The GCP owner ran the script from clean `main` at
`de9213ebf000c224c44bab66b9990f99119c81ab` after the
[reviewed Cloud Shell dry run](https://github.com/UsernameJillzaza/coursepm/issues/27#issuecomment-7015666954).
The [#45 release PR check](https://github.com/UsernameJillzaza/coursepm/actions/runs/44565751863)
passed on staging head `5753cf8cd8330fa90527102123198659d4f78ebd`:
server 119/119, client 39/39, and Docker build OK. The
[owner's deployment record](https://github.com/UsernameJillzaza/coursepm/issues/27#issuecomment-7016610471)
links the running service and screenshots to the `main` merge commit.
Cloud SQL `coursepm-pg` reached `RUNNABLE`. Cloud Build pushed
`asia-southeast1-docker.pkg.dev/cpe334-2026-th042-coursepm/coursepm/coursepm:de9213ebf000c224c44bab66b9990f99119c81ab`
with digest `sha256:c8cd3998c0cd197529a98f063fec7a2229f4029073c7f304f9d18720968ccdc2`.
The [migrate/seed execution](https://console.cloud.google.com/run/jobs/executions/details/asia-southeast1/coursepm-migrate-g6d4z?project=cpe334-2026-th042-coursepm)
completed successfully (1/1 task) before Cloud Run service deployment.
The owner read the execution log with `gcloud run jobs logs read
coursepm-migrate --region=asia-southeast1 --project="$PROJECT_ID" --limit=100`
and queried the revision startup log in Cloud Shell. The inspected log output
contained no password or `DATABASE_URL`; relevant excerpts are below:

```text
2026-11-19 17:16:51 6 migrations found in prisma/migrations
2026-11-19 17:16:52 All migrations have been successfully applied.
2026-11-19 17:16:57 Seeded 8 demo accounts and 3 teams.
CoursePM API listening on http://localhost:3000
```

Revision `coursepm-00001-6hh` serves 100% of traffic. The owner ran
`gcloud run revisions describe coursepm-00001-6hh --region=asia-southeast1
--project="$PROJECT_ID"
--format='value(spec.containers[0].image,status.imageDigest)'`.
Its actual output has two identical digest-qualified URIs:

```text
asia-southeast1-docker.pkg.dev/cpe334-2026-th042-coursepm/coursepm/coursepm@sha256:c8cd3998c0cd197529a98f063fec7a2229f4029073c7f304f9d18720968ccdc2  asia-southeast1-docker.pkg.dev/cpe334-2026-th042-coursepm/coursepm/coursepm@sha256:c8cd3998c0cd197529a98f063fec7a2229f4029073c7f304f9d18720968ccdc2
```

Cloud Run reports the resolved digest for both fields, rather than the
commit-tagged image reference. The Cloud Build output recorded above ties the
`de9213e…` tag to this digest; the revision output ties that digest to the
serving revision.

An external GET to the [public UI](https://coursepm-7cxt6io2na-as.a.run.app/)
returned 200 with title `CoursePM`. Public
[`/api/health`](https://coursepm-7cxt6io2na-as.a.run.app/api/health)
returned 200 with `{"status":"ok","service":"CoursePM API"}`; public
[`/api/ready`](https://coursepm-7cxt6io2na-as.a.run.app/api/ready)
returned 200 with `{"status":"ready","db":"connected"}`. The owner signed in
as seeded student `alpha1@coursepm.test` and reached My Teams / Team Alpha.
Issue #27 holds direct screenshots of the
[signed-in UI](https://github.com/user-attachments/assets/cd5fb3c8-3037-4d1f-9d01-4fc57b1b9f94),
[`/api/ready`](https://github.com/user-attachments/assets/296e6d06-c361-4984-a77b-d2c260bed4ff),
[serving revision](https://github.com/user-attachments/assets/b4c2a50b-5287-449e-97d4-5f722b9bad13),
and [migration job](https://github.com/user-attachments/assets/8fdd1d56-6d05-4c5a-a1ba-6348cebbe15b).
Keep passwords out of screenshots and this document. Subsequent releases use
the automated pipeline in #29.

The release path is a feature branch to `lab5-staging` by reviewed Pull
Request, then a reviewed release Pull Request to `main`. CI builds and tests
both Pull Requests. The #27 manual procedure and evidence are above; from #29
on, every release is automated.

## Automated release pipeline (#29, C-06)

`.github/workflows/deploy.yml` runs on every push to `main`, which means only
when a reviewed release PR merges (`protect-main` blocks direct pushes):

1. **Test.** It reuses `test-and-docker` (`ci-docker.yml`); a failure stops the release.
2. **Sign in without a key.** It uses Workload Identity Federation (#28) in the
   `demo` environment. The provider accepts only this repository's `main` ref in
   `demo`, and `demo` allows deployments only from `main`.
3. **Build.** `docker build --build-arg APP_COMMIT=<full SHA>` tags the image
   `…/coursepm/coursepm:<full SHA>` and pushes it to Artifact Registry.
   `APP_COMMIT` puts the SHA into the client bundle.
4. **Release.** `deploy/release.sh` resolves that tag to its `@sha256` digest,
   points the `coursepm-migrate` job at the digest and runs it to completion,
   then updates the `coursepm` service to the digest and sends 100% of traffic
   to the new revision. A failed migration stops the release before the service
   changes. Secrets, env vars, the Cloud SQL link and the runtime service account
   stay as `deploy/deploy.sh` set them.
5. **Smoke test.** `deploy/smoke_test.py` runs read-only against the public URL:
   `/api/health`, `/api/ready` (`db: connected`), the client HTML and its bundle,
   `/api/teams` → 401, and the release SHA inside the served bundle.
6. **Record.** The job summary lists the commit, image digest, serving revision and URL.

**How to find the running commit.** Every page shows `CoursePM release <short
SHA>` in the footer, linked to the commit; the full SHA is in the link's
tooltip. The deploy run's summary pairs that SHA with the image digest and the
serving revision, and
`gcloud run services describe coursepm --region asia-southeast1 --format='value(status.latestReadyRevisionName)'`
names the revision that is serving now. Images built before #29 (the #27 manual
deploy) show `CoursePM development build`, because they were built without
`APP_COMMIT`.

**Rollback.** Run the workflow manually on `main` with `image_tag` set to the
full SHA of an earlier image. Tests, build, migration and seed are skipped, and
that image is redeployed by digest. Roll back only to an image whose code works
with the current schema; the migrations so far only add tables and columns.

**Offline checks in every PR.** `test-and-docker` runs
`bash deploy/tests/test_release_stub.sh` (fake `gcloud`: digest resolution,
migrate before deploy, rollback skips migration, failures stop before the
service changes, bad input rejected) and the `test_smoke.py` unit tests, so a
broken script fails in review, not during a release.

**`demo` environment variables** (GitHub → Settings → Environments → `demo`).
They hold no secret; the deploy job's "Validate deployment settings" step
stops the release if any is missing.

| Variable | Value comes from |
| --- | --- |
| `GCP_PROJECT_ID` | The GCP project ID recorded above (#23) |
| `GCP_REGION` | The region recorded above (#27) |
| `WIF_PROVIDER` | Full resource name of the WIF provider created in #28 (`projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`) |
| `WIF_SERVICE_ACCOUNT` | E-mail of the deployer service account created in #28 |

The WIF principal for this repository must hold `roles/iam.workloadIdentityUser`
on the deployer service account (#28); that binding lets the workflow
impersonate it without a key.

**Deployer permissions** (`coursepm-deployer`, granted by the GCP owner as a
separate reviewed IAM step). Each command the workflow runs, and the narrowest
role that covers it:

| Command in the pipeline | Role | Scope |
| --- | --- | --- |
| `docker push` to `…/coursepm/coursepm`; `gcloud artifacts docker images describe` | `roles/artifactregistry.writer` | Artifact Registry repository `coursepm` only |
| `gcloud run jobs update` / `execute --wait`; `gcloud run services update` / `update-traffic` / `describe` | `roles/run.developer` | project (or the `coursepm` service and `coursepm-migrate` job) |
| Deploying the job and service as their runtime identity | `roles/iam.serviceAccountUser` | service account `coursepm-runner` only |

The deployer needs no Secret Manager, Cloud SQL or Cloud Build role. The
runtime identity reads the secrets, and the image is built on the GitHub runner.
The first run (below) needed no further role: the four resource-scoped
bindings were enough, and no `serviceusage` or execution 403 occurred.

The smoke test is read-only and uses no account, so the pipeline never needs a
demo password. Sign-in on the live URL is checked by hand in #30.

### First automated release record (#29, C-06)

The change went Issue #29 → reviewed [PR #48](https://github.com/UsernameJillzaza/coursepm/pull/48)
into `lab5-staging` → reviewed release [PR #52](https://github.com/UsernameJillzaza/coursepm/pull/52)
into `main` → CI → deploy. The release PR was opened by Jakkarin and reviewed by
Achirawit, as recorded in #29. Before the release, [PR #51](https://github.com/UsernameJillzaza/coursepm/pull/51)
synced `main` into `lab5-staging`.

Merging #52 pushed `main` to `a36ed20e0b6ed7f5823943f84e7cffb9c73c0aa5`. That push
started [Deploy to Cloud Run run 44611810394](https://github.com/UsernameJillzaza/coursepm/actions/runs/44611810394)
with no manual step; it succeeded in 4 min 6 s.

| Step | Result |
| --- | --- |
| `test` (`test-and-docker`) | Passed: server 119/119, client 41/41, `TEST-L5-10` 5/5, `TEST-L5-11` 6/6, image built with the SHA in its bundle |
| Sign-in | WIF in `demo`, no key, as `coursepm-deployer` |
| Image | `…/coursepm/coursepm:a36ed20…` → OCI index `sha256:fa2676578f26ff9c7e37a8358da72595e52efe050078bd336491b67387e29966` |
| Migrate/seed | Execution `coursepm-migrate-dr4ms` completed (1/1 task) before the service update; "Executed by coursepm-deployer" |
| Service | Revision `coursepm-00002-xvc` served 100% of traffic at the time of this run; "Deployed by coursepm-deployer … using gcloud". `coursepm-00001-6hh` (#27) was kept at 0% for rollback |
| Smoke test | All read-only checks passed, including `release commit a36ed20 is in the served bundle` |

**Commit → image → running revision.** The tag points to an OCI image **index**
(`sha256:fa2676…9966`). Cloud Run records the index's `linux/amd64`
**manifest** (`sha256:3e2cc63ba1b40774583233ff2ee3b5ef38e1fe5092c143e264b54b3fc1ea4f6f`)
in both `spec.containers[0].image` and `status.imageDigest` of `coursepm-00002-xvc`.
`docker buildx imagetools inspect` on the tag lists that manifest under the
index, so the registry itself ties the commit to the serving revision.

**The change is visible.** At the time of this run the public page footer read `CoursePM release a36ed20`,
linked to the full merge commit, with the full SHA as its tooltip. An external
rerun of `EXPECTED_COMMIT=a36ed20… python3 deploy/smoke_test.py https://coursepm-7cxt6io2na-as.a.run.app`
passed all five checks on 2026-11-20. The same commit check had failed against the #27 image
(built without `APP_COMMIT`), so it proves which build is serving. Screenshots
are on [Issue #29](https://github.com/UsernameJillzaza/coursepm/issues/29#issuecomment-7022087944):
the [run](https://github.com/user-attachments/assets/971e575c-0448-4af9-825e-d717e121c8c5),
the [footer with the public URL](https://github.com/user-attachments/assets/327846f9-b447-459b-8161-d99542535a7f),
the [serving revision](https://github.com/user-attachments/assets/84b1d2e3-a4bd-4a5b-a302-5c3aa638ef05)
and the [migration execution](https://github.com/user-attachments/assets/3d27387b-e1ae-4fe9-ad32-03df28e13589).
They contain no credentials.

**Release tag (pending).** The plan is an annotated tag `v0.2.0` on `main` at
`a36ed20`, created after this record is approved; Part 0 will name the Lab 5
release by it. Until it is created it does not exist on GitHub.
