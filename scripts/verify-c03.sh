#!/bin/sh
# Lab 5 C-03 check (#25): run from the root of a fresh clone after
# `cp .env.example .env`. It builds the image with no .env, checks the image for
# secrets, starts the Compose stack, and checks readiness, sign-in and shutdown.
# It prints statuses and API bodies only, never the .env, passwords, connection
# strings or session cookies, so its output can go into the repository as evidence.
#
#   sh scripts/verify-c03.sh | tee c03-run.txt
#   docker compose down -v     # afterwards: stop and delete the local database
set -u
[ -f .env ] || { echo "Missing .env: run 'cp .env.example .env' first." >&2; exit 1; }

echo "commit: $(git rev-parse --short HEAD)"
echo "date:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "docker: $(docker --version)"
echo "compose: $(docker compose version --short)"

echo
echo "== docker build with no .env present"
BUILD_LOG=$(mktemp)
mv .env .env.c03-aside
docker build --progress=plain -t coursepm:c03-check . >"$BUILD_LOG" 2>&1
STATUS=$?
mv .env.c03-aside .env
echo "exit $STATUS"
# On failure show why (the build log has no secrets: there is no .env in the context).
[ "$STATUS" -eq 0 ] || tail -n 20 "$BUILD_LOG"
rm -f "$BUILD_LOG"

echo
echo "== secrets in the image (each count should be 0)"
echo "docker history lines matching password|secret|database_url: $(docker history --no-trunc coursepm:c03-check | grep -ciE 'password|secret|database_url')"
docker run --rm coursepm:c03-check sh -c '
  echo ".env files in /app and /app/server: $(ls -a /app /app/server | grep -c "^\.env")"
  echo "image env vars matching seed|database|postgres: $(env | grep -ciE "seed|database|postgres")"
  echo "user: $(id)"'
docker rmi -f coursepm:c03-check >/dev/null 2>&1

echo
echo "== docker compose up --build -d"
COMPOSE_LOG=$(mktemp)
docker compose up --build -d >"$COMPOSE_LOG" 2>&1
STATUS=$?
echo "exit $STATUS"
[ "$STATUS" -eq 0 ] || tail -n 20 "$COMPOSE_LOG"
rm -f "$COMPOSE_LOG"
i=0
while [ "$i" -lt 30 ] && ! docker compose ps app --format '{{.Status}}' | grep -q '(healthy)'; do
  sleep 2
  i=$((i + 1))
done
docker compose ps -a --format 'table {{.Service}}\t{{.Status}}'

# The host port is APP_PORT from .env; ask Compose which one it actually published.
PORT=$(docker compose port app 3000 | sed 's/.*://')
BASE="http://localhost:$PORT"
echo
echo "== API on the published port ($BASE)"
echo "GET /api/health -> $(curl -s "$BASE/api/health")"
echo "GET /api/ready  -> $(curl -s "$BASE/api/ready")"
echo "GET /           -> HTTP $(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"

echo
echo "== sign in as the seeded Student alpha1@coursepm.test (password: SEED_PASSWORD from .env)"
PASSWORD=$(sed -n 's/^SEED_PASSWORD=//p' .env)
JAR=$(mktemp)
echo "POST /api/auth/login -> HTTP $(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"alpha1@coursepm.test\",\"password\":\"$PASSWORD\"}" "$BASE/api/auth/login")"
echo "GET /api/auth/me     -> $(curl -s -b "$JAR" "$BASE/api/auth/me")"
rm -f "$JAR"

echo
echo "== graceful shutdown"
START=$(date +%s%N)
docker compose stop app >/dev/null 2>&1
END=$(date +%s%N)
echo "docker compose stop app: $(( (END - START) / 1000000 )) ms"
docker compose logs --no-log-prefix app | tail -n 2
