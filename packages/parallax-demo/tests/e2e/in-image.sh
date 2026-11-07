#!/usr/bin/env bash
# Runs the demo's end-to-end specs in the Docker image of the installed @playwright/test version, against the demo,
# which this script builds and serves from this machine, so that the browser, fonts and text rendering are the same on
# every machine. It writes the datasets and builds the demo first, unless PARALLAX_PREBUILT=1 says they are built
# already. Arguments go to `playwright test`, such as spec names or --update-snapshots.
set -euo pipefail
demo="$(cd "$(dirname "$0")/../.." && pwd)"
repo="$(cd "$demo/../.." && pwd)"
read -ra command <<<"$(node -p "require('$demo/tests/e2e/server.json').command")"
url="$(node -p "require('$demo/tests/e2e/server.json').url")"
version="$(cd "$demo" && node -p "require('@playwright/test/package.json').version")"

# A server already running may be serving an older build, which the specs would then pass or record.
if curl -sf "$url" >/dev/null; then
  echo "ERROR something already answers at $url. Stop it first: these specs run against the build this script serves." >&2
  exit 1
fi
if [ "${PARALLAX_PREBUILT:-}" != "1" ]; then
  bash "$demo/scripts/data.sh"
  (cd "$demo" && vp build)
fi

log="$(mktemp)"
cd "$demo"
# In a process group of its own, so that stopping it stops the preview server that `vp` starts as well.
setsid "${command[@]}" >"$log" 2>&1 &
server=$!
trap 'kill -- "-$server" 2>/dev/null || true; rm -f "$log"' EXIT
for _ in $(seq 30); do
  curl -sf "$url" >/dev/null && break
  if ! kill -0 "$server" 2>/dev/null; then
    echo "ERROR the demo's server exited before it was ready:" >&2
    cat "$log" >&2
    exit 1
  fi
  sleep 1
done
curl -sf "$url" >/dev/null || { echo "ERROR the demo's server did not answer at $url within 30 s:" >&2; cat "$log" >&2; exit 1; }

docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp -e CI="${CI:-}" -e PARALLAX_PINNED_IMAGE=1 \
  -v "$repo:$repo" -w "$demo" "mcr.microsoft.com/playwright:v$version-noble" \
  node_modules/.bin/playwright test -c tests/e2e/playwright.config.ts "$@" || {
  status=$?
  echo "The demo's server's log:" >&2
  tail -n 50 "$log" >&2
  exit "$status"
}
