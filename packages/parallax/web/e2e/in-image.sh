#!/usr/bin/env bash
# Runs Playwright in the Docker image of the installed @playwright/test version, against the built demo, which this
# script serves as static files from the host, so that the browser, fonts and text rendering are the same on every
# machine. It builds the wasm worker, the demo's data and the demo first, unless PARALLAX_PREBUILT=1 says they are
# built already, as in CI. Arguments go to `playwright test`, such as spec names or --update-snapshots.
set -euo pipefail
web="$(cd "$(dirname "$0")/.." && pwd)"
read -ra command <<<"$(node -p "require('$web/e2e/demo-server.json').command")"
url="$(node -p "require('$web/e2e/demo-server.json').url")"
version="$(node -p "require('$web/node_modules/@playwright/test/package.json').version")"

# A server already running may be serving an older build, which the tests would then pass or record.
if curl -sf "$url" >/dev/null; then
  echo "Something already answers at $url. Stop it first: these tests run against the build this script serves." >&2
  exit 1
fi
if [ "${PARALLAX_PREBUILT:-}" != "1" ]; then
  (cd "$web" && pnpm build:wasm && pnpm build:data && pnpm build)
fi

log="$(mktemp)"
cd "$web"
"${command[@]}" >"$log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; rm -f "$log"' EXIT
for _ in $(seq 30); do
  curl -sf "$url" >/dev/null && break
  if ! kill -0 "$server" 2>/dev/null; then
    echo "The demo's server exited before it was ready:" >&2
    cat "$log" >&2
    exit 1
  fi
  sleep 1
done
curl -sf "$url" >/dev/null || { echo "The demo's server did not answer at $url within 30 s:" >&2; cat "$log" >&2; exit 1; }

docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp -e CI="${CI:-}" -e PARALLAX_PINNED_IMAGE=1 \
  -v "$web:$web" -w "$web" "mcr.microsoft.com/playwright:v$version-noble" \
  node_modules/.bin/playwright test -c e2e/playwright.config.ts "$@" || {
  status=$?
  echo "The demo's server's log:" >&2
  tail -n 50 "$log" >&2
  exit "$status"
}
