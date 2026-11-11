#!/usr/bin/env bash
# Runs the gallery's screenshots and axe check in the Docker image of the installed @playwright/test version, against
# the gallery, which this script builds and serves from this machine, so that the browser, fonts and text rendering are
# the same on every machine. `--update` records the screenshots again; every other argument goes to `playwright test`,
# such as a page's name to run its sections alone.
set -euo pipefail
gallery="$(cd "$(dirname "$0")/../.." && pwd)"
repo="$(cd "$gallery/../.." && pwd)"
read -ra command <<<"$(node -p "require('$gallery/tests/shots/server.json').command")"
url="$(node -p "require('$gallery/tests/shots/server.json').url")"
version="$(cd "$gallery" && node -p "require('@playwright/test/package.json').version")"

arguments=()
for argument in "$@"; do
  if [ "$argument" = "--update" ]; then
    arguments+=("--update-snapshots")
  else
    arguments+=("$argument")
  fi
done

# A server already running may be serving an older build, which the specs would then pass or record.
if curl -sf "$url" >/dev/null; then
  echo "ERROR something already answers at $url. Stop it first: the screenshots are of the build this script serves." >&2
  exit 1
fi
(cd "$gallery" && vp build)

log="$(mktemp)"
cd "$gallery"
# In a process group of its own, so that stopping it stops the preview server that `vp` starts as well.
setsid "${command[@]}" >"$log" 2>&1 &
server=$!
trap 'kill -- "-$server" 2>/dev/null || true; rm -f "$log"' EXIT
for _ in $(seq 30); do
  curl -sf "$url" >/dev/null && break
  if ! kill -0 "$server" 2>/dev/null; then
    echo "ERROR the gallery's server exited before it was ready:" >&2
    cat "$log" >&2
    exit 1
  fi
  sleep 1
done
curl -sf "$url" >/dev/null || { echo "ERROR the gallery's server did not answer at $url within 30 s:" >&2; cat "$log" >&2; exit 1; }

docker run --rm --name "gallery-shots-$$" --memory "${E2E_MEMORY:-8g}" --network host --user "$(id -u):$(id -g)" -e HOME=/tmp -e CI="${CI:-}" -e GALLERY_PINNED_IMAGE=1 \
  -v "$repo:$repo" -w "$gallery" "mcr.microsoft.com/playwright:v$version-noble" \
  node_modules/.bin/playwright test -c tests/shots/playwright.config.ts "${arguments[@]}" || {
  status=$?
  echo "The gallery's server's log:" >&2
  tail -n 50 "$log" >&2
  exit "$status"
}
