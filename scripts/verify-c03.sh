#!/bin/sh
# Lab 5 C-03 check (#25): run from the root of a fresh clone after
# `cp .env.example .env`. It builds the image with no .env, checks the image for
# secrets, starts the Compose stack, and checks readiness, sign-in and shutdown.
# Every required check prints PASS or FAIL; the script exits 0 only if all pass,
# and 1 otherwise. It prints statuses and API bodies only, never the .env,
# passwords, connection strings or session cookies, so its output can go into
# the repository as evidence.
#
#   sh scripts/verify-c03.sh > c03-run.txt 2>&1; echo "exit $?"   (needs GNU date for ms timing)
#   Redirect rather than pipe: in `sh ... | tee`, $? is tee's exit status (0), so a
#   failed check would look like a pass unless the shell has `set -o pipefail`.
#   docker compose down -v     # afterwards: stop and delete the local database
set -u

ASIDE=.env.c03-aside
if [ -f "$ASIDE" ]; then
  # A previous run was killed while .env was moved aside.
  if [ -f .env ]; then
    echo "Both .env and $ASIDE exist; keep the right one and delete the other." >&2
    exit 2
  fi
  mv "$ASIDE" .env
fi
[ -f .env ] || { echo "Missing .env: run 'cp .env.example .env' first." >&2; exit 2; }

TMP=$(mktemp -d)
# .env is put back however the script ends: normal exit, failure, Ctrl+C or kill.
cleanup() {
  [ -f "$ASIDE" ] && mv "$ASIDE" .env
  rm -rf "$TMP"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

FAILED=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILED=$((FAILED + 1)); }
# expect <what> <actual> <expected>
expect() {
  if [ "$2" = "$3" ]; then pass "$1: $2"; else fail "$1: got '$2', expected '$3'"; fi
}
# http <method> <path> [curl args...]: sets CODE and BODY
http() {
  METHOD=$1
  URLPATH=$2
  shift 2
  CODE=$(curl -s -o "$TMP/body" -w '%{http_code}' -X "$METHOD" "$@" "$BASE$URLPATH")
  BODY=$(cat "$TMP/body" 2>/dev/null)
}

echo "commit: $(git rev-parse --short HEAD)"
echo "date:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "docker: $(docker --version)"
echo "compose: $(docker compose version --short)"

echo
echo "== docker build with no .env present"
mv .env "$ASIDE"
docker build --progress=plain -t coursepm:c03-check . >"$TMP/build.log" 2>&1
STATUS=$?
mv "$ASIDE" .env
expect "docker build exit status" "$STATUS" 0
# On failure show why (the build log has no secrets: there is no .env in the context).
[ "$STATUS" -eq 0 ] || tail -n 20 "$TMP/build.log"

echo
echo "== secrets in the image"
if [ "$STATUS" -eq 0 ]; then
  expect "docker history lines matching password|secret|database_url" \
    "$(docker history --no-trunc coursepm:c03-check | grep -ciE 'password|secret|database_url')" 0
  OUT=$(docker run --rm coursepm:c03-check sh -c \
    'echo "$(ls -a /app /app/server | grep -c "^\.env") $(env | grep -ciE "seed|database|postgres") $(id -u)"')
  # shellcheck disable=SC2086 # split the three counts on purpose
  set -- ${OUT:-? ? ?}
  expect ".env files in /app and /app/server" "${1:-?}" 0
  expect "image env vars matching seed|database|postgres" "${2:-?}" 0
  expect "container user id (non-root node)" "${3:-?}" 1000
  docker rmi -f coursepm:c03-check >/dev/null 2>&1
else
  fail "image checks skipped: the build failed"
fi

echo
echo "== docker compose up --build -d"
docker compose up --build -d >"$TMP/compose.log" 2>&1
STATUS=$?
expect "docker compose up exit status" "$STATUS" 0
[ "$STATUS" -eq 0 ] || tail -n 20 "$TMP/compose.log"
i=0
while [ "$i" -lt 30 ] && ! docker compose ps app --format '{{.Status}}' 2>/dev/null | grep -q '(healthy)'; do
  sleep 2
  i=$((i + 1))
done
docker compose ps -a --format 'table {{.Service}}\t{{.Status}}'
if docker compose ps -a migrate --format '{{.Status}}' 2>/dev/null | grep -q '^Exited (0)'; then
  pass "migrate exited 0"
else
  fail "migrate did not exit 0"
fi
if docker compose ps app --format '{{.Status}}' 2>/dev/null | grep -q '(healthy)'; then
  pass "app healthy"
else
  fail "app not healthy within 60 s"
fi

# The host port is APP_PORT from .env; ask Compose which one it actually published.
PORT=$(docker compose port app 3000 2>/dev/null | sed 's/.*://')
[ -n "$PORT" ] || fail "app has no published port"
BASE="http://localhost:${PORT:-0}"
echo
echo "== API on the published port ($BASE)"
http GET /api/health
echo "GET /api/health -> $CODE $BODY"
expect "GET /api/health status" "$CODE" 200
http GET /api/ready
echo "GET /api/ready  -> $CODE $BODY"
expect "GET /api/ready status" "$CODE" 200
case $BODY in *'"db":"connected"'*) pass "readiness reports the database connected" ;; *) fail "readiness body has no db connected" ;; esac
http GET /
expect "GET / (client) status" "$CODE" 200

echo
echo "== sign in as the seeded Student alpha1@coursepm.test (password: SEED_PASSWORD from .env)"
PASSWORD=$(sed -n 's/^SEED_PASSWORD=//p' .env)
http POST /api/auth/login -c "$TMP/cookies" -H 'Content-Type: application/json' \
  -d "{\"email\":\"alpha1@coursepm.test\",\"password\":\"$PASSWORD\"}"
expect "POST /api/auth/login status" "$CODE" 200
http GET /api/auth/me -b "$TMP/cookies"
echo "GET /api/auth/me -> $CODE $BODY"
expect "GET /api/auth/me status" "$CODE" 200
case $BODY in *'"role":"STUDENT"'*) pass "signed in as a Student" ;; *) fail "/api/auth/me is not the Student" ;; esac

echo
echo "== graceful shutdown"
START=$(date +%s%N)
docker compose stop app >/dev/null 2>&1
END=$(date +%s%N)
MS=$(((END - START) / 1000000))
docker compose logs --no-log-prefix app 2>/dev/null | tail -n 2
if [ "$MS" -lt 5000 ]; then pass "docker compose stop app: $MS ms"; else fail "docker compose stop app took $MS ms (limit 5000)"; fi
if docker compose logs --no-log-prefix app 2>/dev/null | grep -q 'SIGTERM received'; then
  pass "app logged the SIGTERM shutdown"
else
  fail "app did not log the SIGTERM shutdown"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "RESULT: PASS (every C-03 check passed)"
  exit 0
fi
echo "RESULT: FAIL ($FAILED check(s) failed)"
exit 1
