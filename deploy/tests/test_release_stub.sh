#!/usr/bin/env bash
# TEST-L5-10 (C-06): offline test for deploy/release.sh (#29): a fake `gcloud`, no GCP access, no cost.
#   1. normal release: digest resolved, migration awaited, service updated by
#      digest, URL/image/revision exported
#   2. rollback: service updated, migration job not touched
#   3. missing image or failed migration: service not updated
#   4. invalid tag or rollback flag: rejected before any gcloud call
# Run from the repo root: bash deploy/tests/test_release_stub.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASK_TMP="$(mktemp -d)"
trap 'rm -rf "$TASK_TMP"' EXIT
export PROJECT_ID=release-test REGION=asia-southeast1
export IMAGE_TAG=1111111111111111111111111111111111111111
export CALL_LOG="$TASK_TMP/calls" GITHUB_ENV="$TASK_TMP/env"
export PATH="$TASK_TMP:$PATH"
DIGEST='asia-southeast1-docker.pkg.dev/release-test/coursepm/coursepm@sha256:abcdef'

cat > "$TASK_TMP/gcloud" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$CALL_LOG"
case "$*" in
  'artifacts docker images describe '*)
    [[ "${FAIL_AT:-}" != image ]] || exit 1
    echo 'asia-southeast1-docker.pkg.dev/release-test/coursepm/coursepm@sha256:abcdef' ;;
  'run jobs execute '*) [[ "${FAIL_AT:-}" != migration ]] || exit 1 ;;
  'run services describe '*'status.url'*) echo 'https://coursepm.example.test' ;;
  'run services describe '*'latestReadyRevisionName'*) echo 'coursepm-00002-abc' ;;
esac
STUB
chmod +x "$TASK_TMP/gcloud"

: > "$CALL_LOG"
ROLLBACK=false bash "$ROOT/deploy/release.sh" > /dev/null
grep -q "artifacts docker images describe .*/coursepm/coursepm:$IMAGE_TAG" "$CALL_LOG"
grep -q "run jobs update coursepm-migrate --image=$DIGEST" "$CALL_LOG"
grep -q 'run jobs execute coursepm-migrate --wait' "$CALL_LOG"
grep -q "run services update coursepm --image=$DIGEST" "$CALL_LOG"
# The migration must finish before the service changes.
[[ "$(grep -n 'run jobs execute' "$CALL_LOG" | cut -d: -f1)" -lt "$(grep -n 'run services update ' "$CALL_LOG" | head -1 | cut -d: -f1)" ]]
grep -qx 'SERVICE_URL=https://coursepm.example.test' "$GITHUB_ENV"
grep -qx "DEPLOYED_IMAGE=$DIGEST" "$GITHUB_ENV"
grep -qx 'SERVING_REVISION=coursepm-00002-abc' "$GITHUB_ENV"
echo 'TEST-L5-10 PASS normal release migrates first, then deploys by digest and exports URL/image/revision'

: > "$CALL_LOG"
ROLLBACK=true bash "$ROOT/deploy/release.sh" > /dev/null
if grep -q 'run jobs' "$CALL_LOG"; then echo 'Rollback touched the migration job' >&2; exit 1; fi
grep -q "run services update coursepm --image=$DIGEST" "$CALL_LOG"
echo 'TEST-L5-10 PASS rollback reuses the image without touching the migration job'

for failure in image migration; do
  : > "$CALL_LOG"
  if ROLLBACK=false FAIL_AT="$failure" bash "$ROOT/deploy/release.sh" > /dev/null 2>&1; then
    echo "Expected the $failure failure to stop the release" >&2; exit 1
  fi
  if grep -q 'run services update' "$CALL_LOG"; then
    echo "Service changed after the $failure failure" >&2; exit 1
  fi
  echo "TEST-L5-10 PASS $failure failure stops the release before the service changes"
done

for bad in 'IMAGE_TAG=invalid;tag' 'IMAGE_TAG=de9213e' 'ROLLBACK=yes'; do
  : > "$CALL_LOG"
  if env "$bad" bash "$ROOT/deploy/release.sh" > /dev/null 2>&1; then
    echo "Accepted $bad" >&2; exit 1
  fi
  test ! -s "$CALL_LOG"
done
echo 'TEST-L5-10 PASS invalid tag or rollback flag is rejected before any gcloud call'
