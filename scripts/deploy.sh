#!/usr/bin/env bash
set -euo pipefail

# Deploys the newest published release: the server pulls the image CI built and
# smoke-tested, recreates the service and waits for it to report healthy.
#
# Nothing is built here. What runs in production is exactly what CI tested —
# cut a release with `just release` first, and wait for the Image workflow.
#
# It does NOT touch the server's docker-compose.yml or its Caddyfile. Those are
# shared with authentik, kimai, erpnext, glance and finance, and a deploy script
# that rewrites them can take an unrelated site down on a bad day. Put them in
# place by hand; this script only pulls and recreates what is ours.
#
#   DEPLOY_HOST     ssh alias               (default: frrcode)
#   DEPLOY_DIR      compose directory       (default: the login's home)
#   DEPLOY_SERVICE  compose service name    (default: timeinator)
#   DEPLOY_IMAGE    image the service runs  (default: ghcr.io/frrcode/timeinator:latest)

host="${DEPLOY_HOST:-frrcode}"
dir="${DEPLOY_DIR:-.}"
service="${DEPLOY_SERVICE:-timeinator}"
image="${DEPLOY_IMAGE:-ghcr.io/frrcode/timeinator:latest}"

# Pre-flight: fail here, not halfway through on the server, if there is nothing
# published to deploy.
echo "==> checking ${image}"
if ! docker manifest inspect "$image" >/dev/null 2>&1; then
  echo "error: ${image} is not in the registry (or not pullable from here)." >&2
  echo "       cut a release with \`just release\` and wait for the Image workflow." >&2
  exit 1
fi

# One ssh connection for everything. Several back-to-back logins trip per-source
# throttling (OpenSSH's PerSourcePenalties, fail2ban) and get reset mid-handshake.
socket="$(mktemp -u "${TMPDIR:-/tmp}/deploy.XXXXXX")"
ssh -fNM -o ControlPath="$socket" "$host"
trap 'ssh -o ControlPath="$socket" -O exit "$host" 2>/dev/null' EXIT
remote=(ssh -o ControlPath="$socket" "$host")

# The compose service has to be pointing at the registry image, or the pull
# below fetches it and then runs the old one anyway.
configured="$("${remote[@]}" "cd $dir && docker compose config --images $service")"
if [ "$configured" != "$image" ]; then
  echo "error: ${service} on ${host} runs ${configured}, not ${image}." >&2
  echo "       set \`image: ${image}\` in its compose file first." >&2
  exit 1
fi

echo "==> pulling and recreating ${service} on ${host}"
# Named explicitly rather than a bare `up -d`: the compose file holds authentik,
# kimai, erpnext, glance, caddy and finance too, and recreating those because a
# timeinator image changed would be an outage for six unrelated things.
#
# --wait blocks on the healthcheck, which queries SQLite, so a green deploy also
# proves the bind mount is present and writable.
if ! "${remote[@]}" "
  set -euo pipefail
  mkdir -p ~/data/timeinator
  cd $dir
  docker compose pull -q $service
  docker compose up -d --force-recreate --wait --wait-timeout 120 $service
"; then
  echo "error: ${service} did not become healthy. Recent logs:" >&2
  "${remote[@]}" "docker logs --tail 50 $service" >&2 || true
  exit 1
fi

version="$("${remote[@]}" "docker inspect -f '{{index .Config.Labels \"org.opencontainers.image.version\"}}' $service")"
echo "==> ${service} healthy; running ${version}"
