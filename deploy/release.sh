#!/usr/bin/env bash
# CoursePM automated release (#29), called by .github/workflows/deploy.yml after
# the image for IMAGE_TAG has been pushed. Adapted from the Lab 5 starter.
#
#   1. Resolve the commit-tagged image to its immutable @sha256 digest.
#   2. Normal release: point the migrate/seed job at that digest and run it to
#      completion. A failed migration stops here, before the service changes.
#      Rollback: reuse an existing image and skip migration and seed.
#   3. Deploy the service by digest, send all traffic to the new revision, and
#      export SERVICE_URL, DEPLOYED_IMAGE and SERVING_REVISION for later steps.
#
# The job's and service's secrets, env vars, Cloud SQL link and runtime service
# account were set by deploy/deploy.sh (#27); updating only the image keeps them.
# Offline test: bash deploy/tests/test_release_stub.sh
set -euo pipefail

: "${PROJECT_ID:?Required}" "${REGION:?Required}" "${IMAGE_TAG:?Required}"
SERVICE_NAME="${SERVICE_NAME:-coursepm}"
MIGRATE_JOB_NAME="${MIGRATE_JOB_NAME:-coursepm-migrate}"
REPO_NAME="${REPO_NAME:-coursepm}"
ROLLBACK="${ROLLBACK:-false}"

[[ "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]] || { echo 'IMAGE_TAG must be a full 40-character commit SHA.' >&2; exit 1; }
[[ "$ROLLBACK" == true || "$ROLLBACK" == false ]] || { echo 'ROLLBACK must be true or false.' >&2; exit 1; }

IMAGE_PATH="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$SERVICE_NAME"
DIGEST_IMAGE="$(gcloud artifacts docker images describe "$IMAGE_PATH:$IMAGE_TAG" \
  --project="$PROJECT_ID" --format='value(image_summary.fully_qualified_digest)')"
[[ "$DIGEST_IMAGE" == "$IMAGE_PATH@sha256:"* ]] || { echo "No image found for tag $IMAGE_TAG." >&2; exit 1; }
echo "Image: $IMAGE_PATH:$IMAGE_TAG -> $DIGEST_IMAGE"

if [[ "$ROLLBACK" == false ]]; then
  gcloud run jobs update "$MIGRATE_JOB_NAME" --image="$DIGEST_IMAGE" \
    --project="$PROJECT_ID" --region="$REGION" --quiet
  gcloud run jobs execute "$MIGRATE_JOB_NAME" --wait \
    --project="$PROJECT_ID" --region="$REGION" --quiet
else
  echo 'Rollback: reusing an existing image; migration and seed are skipped.'
fi

gcloud run services update "$SERVICE_NAME" --image="$DIGEST_IMAGE" \
  --project="$PROJECT_ID" --region="$REGION" --quiet
gcloud run services update-traffic "$SERVICE_NAME" --to-latest \
  --project="$PROJECT_ID" --region="$REGION" --quiet

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" \
  --region="$REGION" --format='value(status.url)')"
SERVING_REVISION="$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" \
  --region="$REGION" --format='value(status.latestReadyRevisionName)')"
[[ -n "$SERVICE_URL" && -n "$SERVING_REVISION" ]] || { echo 'Could not read the service URL or revision.' >&2; exit 1; }
echo "Service URL: $SERVICE_URL"
echo "Serving revision: $SERVING_REVISION"

if [[ -n "${GITHUB_ENV:-}" ]]; then
  printf 'SERVICE_URL=%s\nDEPLOYED_IMAGE=%s\nSERVING_REVISION=%s\n' \
    "$SERVICE_URL" "$DIGEST_IMAGE" "$SERVING_REVISION" >> "$GITHUB_ENV"
fi
