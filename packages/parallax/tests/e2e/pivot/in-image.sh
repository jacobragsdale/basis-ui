#!/usr/bin/env bash
# Runs the React pivot's end-to-end specs in the Docker image of the installed @playwright/test version, against the
# harness, which this script builds and serves from this machine, so that the browser, fonts and text rendering are the
# same on every machine. It generates the dataset and builds the harness first, unless PARALLAX_PREBUILT=1 says they
# are built already, as in CI. Arguments go to `playwright test`, such as spec names or --update-snapshots.
set -euo pipefail
package="$(cd "$(dirname "$0")/../../.." && pwd)"
repo="$(cd "$package/../.." && pwd)"
read -ra command <<<"$(node -p "require('$package/tests/e2e/pivot/server.json').command")"
url="$(node -p "require('$package/tests/e2e/pivot/server.json').url")"
version="$(cd "$package" && node -p "require('@playwright/test/package.json').version")"

# A server already running may be serving an older build, which the specs would then pass or record.
if curl -sf "$url" >/dev/null; then
  echo "ERROR something already answers at $url. Stop it first: these specs run against the build this script serves." >&2
  exit 1
fi
if [ "${PARALLAX_PREBUILT:-}" != "1" ]; then
  bash "$package/tests/e2e/pivot/data.sh"
  (cd "$package" && vp build tests/e2e/pivot/harness)
fi

log="$(mktemp)"
cd "$package"
# In a process group of its own, so that stopping it stops the preview server that `vp` starts as well.
setsid "${command[@]}" >"$log" 2>&1 &
server=$!
trap 'kill -- "-$server" 2>/dev/null || true; rm -f "$log"' EXIT
for _ in $(seq 30); do
  curl -sf "$url" >/dev/null && break
  if ! kill -0 "$server" 2>/dev/null; then
    echo "ERROR the harness's server exited before it was ready:" >&2
    cat "$log" >&2
    exit 1
  fi
  sleep 1
done
curl -sf "$url" >/dev/null || { echo "ERROR the harness's server did not answer at $url within 30 s:" >&2; cat "$log" >&2; exit 1; }

docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp -e CI="${CI:-}" -e PARALLAX_PINNED_IMAGE=1 \
  -v "$repo:$repo" -w "$package" "mcr.microsoft.com/playwright:v$version-noble" \
  node_modules/.bin/playwright test -c tests/e2e/pivot/playwright.config.ts "$@" || {
  status=$?
  echo "The harness's server's log:" >&2
  tail -n 50 "$log" >&2
  exit "$status"
}
