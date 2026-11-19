#!/usr/bin/env bash
set -euo pipefail
set +x

# CoursePM Lab 5 (#27): one-time manual setup from Cloud Shell.
# Review DRY_RUN=1 output with the GCP owner and teammate before a real run.
# Real deployments must use a clean checkout of main. Later releases use #29.

DRY_RUN="${DRY_RUN:-0}"
PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID to the actual GCP project ID from Issue #23}"
REGION="${REGION:?Set REGION after owner review}"

if [[ "$DRY_RUN" != 0 && "$DRY_RUN" != 1 ]]; then
  echo "DRY_RUN must be 0 or 1" >&2
  exit 1
fi
if [[ ! "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "Invalid GCP project ID" >&2
  exit 1
fi
if [[ ! "$REGION" =~ ^[a-z]+-[a-z]+[0-9]+$ ]]; then
  echo "Invalid GCP region" >&2
  exit 1
fi
if [[ ! -f Dockerfile || ! -f server/package.json ]]; then
  echo "Run this script from the CoursePM repository root" >&2
  exit 1
fi

REPO_NAME=coursepm
SQL_INSTANCE=coursepm-pg
DB_NAME=coursepm
DB_USER=coursepm
SERVICE_NAME=coursepm
MIGRATE_JOB=coursepm-migrate
SA_NAME=coursepm-runner
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SQL_CONNECTION="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
DB_PASSWORD_SECRET=coursepm-db-password
DATABASE_URL_SECRET=coursepm-database-url
SEED_PASSWORD_SECRET=coursepm-seed-password

SOURCE_SHA="$(git rev-parse HEAD)"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:${SOURCE_SHA}"

if [[ "$DRY_RUN" != 1 ]]; then
  if [[ "$(git branch --show-current)" != main ]]; then
    echo "Real deployment requires the reviewed release on main" >&2
    exit 1
  fi
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Real deployment requires a clean checkout" >&2
    exit 1
  fi
  active_project="$(gcloud config get-value project 2>/dev/null)"
  if [[ "$active_project" != "$PROJECT_ID" ]]; then
    echo "Active gcloud project differs from PROJECT_ID; stop and review" >&2
    exit 1
  fi
  if [[ "$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)')" != True ]]; then
    echo "Billing is not enabled for PROJECT_ID; stop and review" >&2
    exit 1
  fi
fi

# Only non-secret arguments are logged. Never enable shell tracing here.
run_cmd() {
  local arg
  if [[ "$DRY_RUN" == 1 ]]; then printf '[DRY_RUN]'; else printf '+'; fi
  for arg in "$@"; do
    if [[ "$arg" == --password=* ]]; then arg='--password=<REDACTED>'; fi
    printf ' %q' "$arg"
  done
  printf '\n'
  if [[ "$DRY_RUN" != 1 ]]; then "$@"; fi
}

# Secret values are sent on stdin. Neither the value nor the pipeline is logged.
create_secret_with_value() {
  local name="$1" value="$2"
  run_cmd gcloud secrets create "$name" --replication-policy=automatic --project "$PROJECT_ID"
  if [[ "$DRY_RUN" == 1 ]]; then
    printf '[DRY_RUN] add a redacted value to secret %s\n' "$name"
  else
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project "$PROJECT_ID" >/dev/null
  fi
}

echo "CoursePM first deployment plan"
printf 'Project: %s\nRegion: %s\nSource commit: %s\nImage: %s\nDry run: %s\n' \
  "$PROJECT_ID" "$REGION" "$SOURCE_SHA" "$IMAGE_URI" "$DRY_RUN"

run_cmd gcloud services enable \
  run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com iam.googleapis.com \
  --project "$PROJECT_ID"

if [[ "$DRY_RUN" == 1 ]] || ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  run_cmd gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker --location "$REGION" \
    --description="CoursePM container images" --project "$PROJECT_ID"
fi

if [[ "$DRY_RUN" == 1 ]] || ! gcloud sql instances describe "$SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
  run_cmd gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_16 --edition=enterprise --tier=db-f1-micro \
    --region="$REGION" --storage-size=10GB --storage-type=SSD \
    --no-storage-auto-increase --assign-ip --project "$PROJECT_ID"
fi

if [[ "$DRY_RUN" == 1 ]] || ! gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
  run_cmd gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project "$PROJECT_ID"
fi

if [[ "$DRY_RUN" == 1 ]] || ! gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  run_cmd gcloud iam service-accounts create "$SA_NAME" \
    --display-name="CoursePM Cloud Run runtime" --project "$PROJECT_ID"
fi
run_cmd gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" --role=roles/cloudsql.client \
  --condition=None --quiet

# Never rotate a database password implicitly. An interrupted setup with only
# some of these resources present needs owner review before resuming.
if [[ "$DRY_RUN" == 1 ]]; then
  echo "[DRY_RUN] if DB user and both secrets are absent, create them together"
  run_cmd gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" \
    '--password=<REDACTED>' --project "$PROJECT_ID"
  create_secret_with_value "$DB_PASSWORD_SECRET" '<REDACTED>'
  create_secret_with_value "$DATABASE_URL_SECRET" '<REDACTED>'
else
  db_user_exists=0
  db_password_exists=0
  database_url_exists=0
  db_users="$(gcloud sql users list --instance="$SQL_INSTANCE" --project "$PROJECT_ID" --format='value(name)')"
  if grep -Fxq "$DB_USER" <<<"$db_users"; then db_user_exists=1; fi
  if gcloud secrets describe "$DB_PASSWORD_SECRET" --project "$PROJECT_ID" >/dev/null 2>&1; then db_password_exists=1; fi
  if gcloud secrets describe "$DATABASE_URL_SECRET" --project "$PROJECT_ID" >/dev/null 2>&1; then database_url_exists=1; fi
  if [[ "$db_user_exists$db_password_exists$database_url_exists" == 000 ]]; then
    db_password="$(openssl rand -hex 24)"
    database_url="postgresql://${DB_USER}:${db_password}@localhost/${DB_NAME}?host=/cloudsql/${SQL_CONNECTION}"
    run_cmd gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" \
      --password="$db_password" --project "$PROJECT_ID"
    create_secret_with_value "$DB_PASSWORD_SECRET" "$db_password"
    create_secret_with_value "$DATABASE_URL_SECRET" "$database_url"
    unset db_password database_url
  elif [[ "$db_user_exists$db_password_exists$database_url_exists" != 111 ]]; then
    echo "DB user/password/URL resources are incomplete; review them manually before retrying" >&2
    exit 1
  fi
  for secret in "$DB_PASSWORD_SECRET" "$DATABASE_URL_SECRET"; do
    if ! gcloud secrets versions describe latest --secret="$secret" --project="$PROJECT_ID" >/dev/null 2>&1; then
      echo "Secret $secret has no latest version; review before retrying" >&2
      exit 1
    fi
  done
fi

if [[ "$DRY_RUN" == 1 ]]; then
  create_secret_with_value "$SEED_PASSWORD_SECRET" '<REDACTED>'
elif ! gcloud secrets describe "$SEED_PASSWORD_SECRET" --project "$PROJECT_ID" >/dev/null 2>&1; then
  seed_password="$(openssl rand -hex 24)"
  create_secret_with_value "$SEED_PASSWORD_SECRET" "$seed_password"
  unset seed_password
fi
if [[ "$DRY_RUN" != 1 ]] && ! gcloud secrets versions describe latest --secret="$SEED_PASSWORD_SECRET" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "Seed password secret has no latest version; review before retrying" >&2
  exit 1
fi

for secret in "$DATABASE_URL_SECRET" "$SEED_PASSWORD_SECRET"; do
  run_cmd gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role=roles/secretmanager.secretAccessor --project "$PROJECT_ID" --quiet
done

run_cmd gcloud builds submit --tag "$IMAGE_URI" --project "$PROJECT_ID"

# Dockerfile's working directory is /app/server. The seed requires
# SEED_PASSWORD; the web container receives DATABASE_URL only.
run_cmd gcloud run jobs deploy "$MIGRATE_JOB" \
  --image "$IMAGE_URI" --region "$REGION" --service-account "$SA_EMAIL" \
  --set-cloudsql-instances "$SQL_CONNECTION" \
  --set-secrets "DATABASE_URL=${DATABASE_URL_SECRET}:latest,SEED_PASSWORD=${SEED_PASSWORD_SECRET}:latest" \
  --set-env-vars "NODE_ENV=production,TZ=Asia/Bangkok,DB_POOL_MAX=3" \
  --command sh --args '-c,npm run db:deploy && npm run db:seed' \
  --max-retries 0 --task-timeout 600s --project "$PROJECT_ID"

# A failed migration/seed stops the script before the public service changes.
run_cmd gcloud run jobs execute "$MIGRATE_JOB" --region "$REGION" --wait --project "$PROJECT_ID"

run_cmd gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URI" --region "$REGION" --platform managed \
  --allow-unauthenticated --service-account "$SA_EMAIL" \
  --set-cloudsql-instances "$SQL_CONNECTION" \
  --set-secrets "DATABASE_URL=${DATABASE_URL_SECRET}:latest" \
  --set-env-vars "NODE_ENV=production,TZ=Asia/Bangkok,DB_POOL_MAX=3" \
  --min-instances 0 --max-instances 3 --memory 512Mi --cpu 1 \
  --port 3000 --project "$PROJECT_ID"

if [[ "$DRY_RUN" == 1 ]]; then
  echo "[DRY_RUN] after deployment, read the service URL and check /api/health, /api/ready, and seeded-user sign-in"
else
  service_url="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
  printf 'Service URL: %s\nHealth: %s/api/health\nReady: %s/api/ready\n' \
    "$service_url" "$service_url" "$service_url"
  echo "Verify the public UI and seeded-user sign-in, then record the URL and results in deployment.md."
fi
