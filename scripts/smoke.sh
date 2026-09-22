#!/usr/bin/env bash
set -euo pipefail

# Runs a built image against a throwaway data directory and checks what users
# depend on: the app, its assets, the SPA fallback, the API and the database.
# CI runs this on every image before it may be pushed.
#
#   scripts/smoke.sh [image]    (default: timeinator:local)

image="${1:-timeinator:local}"
name="timeinator-smoke-$$"
port="${SMOKE_PORT:-4099}"
base="http://127.0.0.1:${port}"
data="$(mktemp -d "${TMPDIR:-/tmp}/timeinator-smoke.XXXXXX")"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "--- container logs" >&2
    docker logs "$name" >&2 2>&1 || true
  fi
  docker rm -f "$name" >/dev/null 2>&1 || true
  # The container chowned it to uid 1000; clean up through docker, not rm.
  docker run --rm -v "$data:/d" alpine:3.24 sh -c 'rm -rf /d/*' >/dev/null 2>&1 || true
  rmdir "$data" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Status, content type and body of one request, checked in one place.
#   expect <path> <status> <content-type prefix> [grep pattern] [method] [body]
expect() {
  local path="$1" status="$2" type="$3" pattern="${4:-}" method="${5:-GET}" payload="${6:-}"
  local out headers body code
  out="$(mktemp)"
  headers="$(curl -sS -o "$out" -D - -X "$method" \
    ${payload:+-H 'content-type: application/json' --data "$payload"} \
    "${base}${path}")"
  code="$(printf '%s' "$headers" | awk 'toupper($1) ~ /^HTTP/ {c=$2} END {print c}')"
  [ "$code" = "$status" ] || fail "$method $path: status $code, want $status"
  printf '%s' "$headers" | grep -qi "^content-type: ${type}" ||
    fail "$method $path: content-type is not ${type}"
  if [ -n "$pattern" ]; then
    grep -q -- "$pattern" "$out" || fail "$method $path: body lacks '$pattern'"
  fi
  body="$(cat "$out")"
  rm -f "$out"
  echo "ok   $method $path -> $code"
  LAST_BODY="$body"
}

echo "==> starting ${image}"
docker run -d --name "$name" -p "127.0.0.1:${port}:4002" -v "$data:/data" "$image" >/dev/null

echo "==> waiting for /api/health"
for _ in $(seq 1 30); do
  if curl -fsS "${base}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

expect /api/health 200 application/json '"status":"ok"'
expect / 200 text/html '<div id="root">'
expect /pick/doesnotexist 200 text/html '<div id="root">'
expect /favicon.svg 200 image/svg+xml
expect /manifest.webmanifest 200 application/manifest+json '"start_url"'
expect /api/nope 404 application/json '"error"'
expect /api/polls 201 application/json '"pollId"' POST '{"title":"Smoke"}'
poll="$(printf '%s' "$LAST_BODY" | sed -n 's/.*"pollId":"\([^"]*\)".*/\1/p')"
[ -n "$poll" ] || fail "POST /api/polls returned no pollId"
expect "/api/polls/${poll}" 200 application/json '"Smoke"'
expect /api/health 200 application/json '"polls":1'

# The process drops root after taking /data; make sure it stayed dropped.
user="$(docker exec "$name" stat -c %U /proc/1)"
[ "$user" = "node" ] || fail "server runs as ${user}, not node"
echo "ok   runs as node"

health=""
for _ in $(seq 1 20); do
  health="$(docker inspect -f '{{.State.Health.Status}}' "$name")"
  [ "$health" = "starting" ] || break
  sleep 1
done
[ "$health" = "healthy" ] || [ "$health" = "starting" ] ||
  fail "image healthcheck reports ${health}"
echo "ok   healthcheck ${health}"

echo "==> ${image} passed"
