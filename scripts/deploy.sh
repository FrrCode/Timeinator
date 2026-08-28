#!/usr/bin/env bash
set -euo pipefail

# Builds the production image here, ships it to the server over ssh, and restarts
# the timeinator service.
#
# One image, where finance ships two: `server/index.ts` serves both `dist/` and
# `/api` from a single process, so there is no client container to split out.
#
# There is no registry in this picture, deliberately — the same reasoning as
# finance: the target box runs one shared compose stack for several unrelated
# projects, and a registry (with its auth, its disk and its own uptime) is more
# moving parts than the thing being deployed. `docker save | ssh docker load`
# needs nothing that is not already there.
#
# It does NOT touch the server's docker-compose.yml or its Caddyfile. Those are
# shared with authentik, kimai, erpnext, glance and finance, and a deploy script
# that rewrites them can take an unrelated site down on a bad day. Put them in
# place by hand; this script only builds, ships and restarts what is ours.

host="${DEPLOY_HOST:-frrcode}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# The tag names a commit, so it has to actually be that commit. A dirty tree would
# produce `timeinator:0195284` containing something that is not 0195284 — and the
# first time that matters is while rolling back, which is the worst moment to find
# out.
if [ -n "$(git status --porcelain)" ] && [ "${ALLOW_DIRTY:-}" != "1" ]; then
  echo "error: working tree is dirty; the image tag would name a commit it does not contain." >&2
  echo "       commit first, or re-run with ALLOW_DIRTY=1 to tag it anyway." >&2
  exit 1
fi

tag="$(git rev-parse --short HEAD)"
# Only reachable via ALLOW_DIRTY=1 above. The suffix is the point of allowing it:
# the image stays traceable to a commit while saying out loud that it is not it.
if [ -n "$(git status --porcelain)" ]; then
  tag="${tag}-dirty"
fi

images=("timeinator:${tag}" "timeinator:latest")

echo "==> building timeinator:${tag}"
docker build -f docker/Dockerfile -t "timeinator:${tag}" -t timeinator:latest .

# Both ends are linux/x86_64, so no buildx cross-compilation. If that ever stops
# being true this is where it breaks — loudly, with an exec format error on first
# start rather than a puzzling crash loop.
local_arch="$(uname -m)"
remote_arch="$(ssh "$host" 'uname -m')"
if [ "$local_arch" != "$remote_arch" ]; then
  echo "error: this machine is ${local_arch} but ${host} is ${remote_arch}." >&2
  echo "       build with buildx --platform linux/${remote_arch} instead." >&2
  exit 1
fi

echo "==> shipping $(printf '%s ' "${images[@]}")to ${host}"
# gzip because this is a couple of hundred MB of mostly-text layers over someone's
# uplink, and the server has CPU to spare and no bandwidth to waste.
docker save "${images[@]}" | gzip | ssh "$host" 'gunzip | docker load'

echo "==> starting timeinator on ${host}"
ssh "$host" '
  set -euo pipefail
  # The SQLite file lives here. It is the only state this app has, and the only
  # thing on the box worth backing up for it.
  mkdir -p ~/data/timeinator
  cd ~
  # Named explicitly rather than a bare `up -d`: the compose file holds authentik,
  # kimai, erpnext, glance, caddy and finance too, and recreating those because a
  # timeinator image changed would be an outage for six unrelated things.
  docker compose up -d timeinator
'

echo "==> waiting for timeinator to report healthy"
# "Container started" is not "serving": the health endpoint queries SQLite, so this
# also proves the bind mount is present and writable, which is the failure this
# deployment is most likely to hit.
for _ in $(seq 1 60); do
  state="$(ssh "$host" 'docker inspect -f "{{.State.Health.Status}}" timeinator 2>/dev/null || echo missing')"
  case "$state" in
    healthy) echo "==> timeinator healthy; deployed ${tag}"; exit 0 ;;
    unhealthy) echo "error: timeinator is unhealthy. Recent logs:" >&2
               ssh "$host" 'docker logs --tail 50 timeinator' >&2
               exit 1 ;;
  esac
  sleep 2
done

echo "error: timeinator did not become healthy within 120s. Recent logs:" >&2
ssh "$host" 'docker logs --tail 50 timeinator' >&2
exit 1
