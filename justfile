# One front door for this repo's commands.
#
# Most recipes are thin wrappers over the package.json script of the same name.
# The scripts stay where they are on purpose: Biome, Vitest and any future CI
# invoke them directly, so moving the command lines up here would just mean two
# callers reaching past this file into a thing that no longer exists.

_default:
    @just --list --unsorted

# Install dependencies.
install:
    pnpm install

# Vite on :4001 and the API on :4002, with /api proxied across.
dev:
    pnpm dev

# Type-check the client and the server, then bundle.
build:
    pnpm build

# Serve dist/ and /api from one Node process, as production does.
start:
    pnpm start

# Vitest, once.
test:
    pnpm test

# Vitest, watching.
test-watch:
    pnpm test:watch

# Fail if anything is unformatted or lints badly.
check:
    pnpm check

# Rewrite what Biome can fix.
fix:
    pnpm fix

# Everything CI would run.
verify: check test build

# `just --list` shows only the last unbroken run of comment lines above a recipe,
# so the blank line below keeps this note out of the listing while the one-liner
# under it becomes the description.

# Build the production image and run it against a throwaway data dir, as the server will.
docker-run port="4002":
    #!/usr/bin/env bash
    set -euo pipefail
    docker build -f docker/Dockerfile -t timeinator:local .
    mkdir -p .docker-data
    docker rm -f timeinator-local >/dev/null 2>&1 || true
    docker run --rm --name timeinator-local \
        -p {{ port }}:4002 \
        -v "$PWD/.docker-data:/data" \
        timeinator:local

# Check a built image the way CI does before publishing it.
smoke image="timeinator:local":
    ./scripts/smoke.sh {{ image }}

# Rewrite CHANGELOG.md from the commit history.
changelog:
    pnpm changelog

# Fail if CHANGELOG.md is out of date with the history.
changelog-check:
    pnpm changelog --check

# The tag push is what publishes: CI builds and pushes the image, updates
# CHANGELOG.md and creates the GitHub release. `git pull` afterwards for CI's
# changelog commit.

# Bump the version, commit, tag and push: patch, minor or major.
release bump="patch":
    ./scripts/release.sh {{ bump }}

# Deploys a published image, never a local build. The server's shared
# docker-compose.yml and Caddyfile are placed by hand, not by this — they carry
# six other projects. DEPLOY_HOST, DEPLOY_DIR, DEPLOY_SERVICE and DEPLOY_IMAGE
# override the defaults.

# Pull the newest release on the server, recreate the service, wait for healthy.
deploy:
    ./scripts/deploy.sh
    ntf "Timinator" "Deployed to server"
