#!/usr/bin/env bash
set -euo pipefail

# Cuts a release: bumps package.json, commits `chore(release): vX.Y.Z`, tags it
# and pushes both in one go. Pushing the tag is the only thing that publishes —
# CI turns it into the image, the changelog section and the GitHub release.
#
#   scripts/release.sh [patch|minor|major]    (default: patch)

bump="${1:-patch}"
case "$bump" in
  patch | minor | major) ;;
  *) echo "usage: $0 [patch|minor|major]" >&2; exit 2 ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

branch="$(git symbolic-ref --short HEAD 2>/dev/null || echo "(detached)")"
if [ "$branch" != "main" ]; then
  echo "error: releases are cut from main, not ${branch}." >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree is dirty; the tag would not describe what is committed." >&2
  exit 1
fi

# CI commits the changelog back to main after every push, so a local main is
# routinely one commit behind. Catch up now, or the push at the end is rejected.
git fetch --quiet --tags origin main
behind="$(git rev-list --count HEAD..origin/main)"
ahead="$(git rev-list --count origin/main..HEAD)"
if [ "$behind" -gt 0 ] && [ "$ahead" -gt 0 ]; then
  echo "error: main and origin/main have diverged; rebase first." >&2
  exit 1
fi
if [ "$behind" -gt 0 ]; then
  echo "==> fast-forwarding ${behind} commit(s) from origin/main"
  git merge --quiet --ff-only origin/main
fi

current="$(node -p 'require("./package.json").version')"
# shellcheck disable=SC2016 # JavaScript, not shell
next="$(node -e '
  const [bump, current] = process.argv.slice(1);
  const [core, pre] = current.split("-");
  let [major, minor, patch] = core.split(".").map(Number);
  // A prerelease is the version it leads up to, so bumping to that level just
  // drops the suffix: 1.2.0-rc.1 + minor is 1.2.0, not 1.3.0.
  if (bump === "major") {
    if (!(pre && minor === 0 && patch === 0)) major++;
    minor = 0; patch = 0;
  } else if (bump === "minor") {
    if (!(pre && patch === 0)) minor++;
    patch = 0;
  } else if (!pre) {
    patch++;
  }
  console.log(`${major}.${minor}.${patch}`);
' "$bump" "$current")"
tag="v${next}"

if git rev-parse --quiet --verify "refs/tags/${tag}" >/dev/null; then
  echo "error: ${tag} already exists." >&2
  exit 1
fi

echo "==> ${current} -> ${next}"
# shellcheck disable=SC2016
node -e '
  const fs = require("node:fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  pkg.version = process.argv[1];
  fs.writeFileSync("package.json", `${JSON.stringify(pkg, null, "\t")}\n`);
' "$next"

git commit --quiet -m "chore(release): ${tag}" -- package.json
git tag -a "$tag" -m "$tag"

# Atomic, so a rejected branch cannot leave a tag on the remote pointing at a
# commit nobody else has.
git push --atomic origin main "$tag"

echo "==> pushed ${tag}. CI now publishes the image, the changelog and the GitHub release:"
echo "      gh run watch"
echo "    then \`git pull\` for CI's changelog commit, and \`just deploy\` to ship it."
