#!/usr/bin/env bash
# Records the Angular pivot's canvas into this folder, for the pivot's parity spec: builds the Angular demo from web/
# (its engine, its data and the app) unless PARALLAX_PREBUILT=1 says it is built, serves it on port 8791, and runs
# capture.ts in the pinned Playwright image of the installed @playwright/test version. Run it from anywhere; it goes
# with web/ in roadmap step 2.7. web's build:wasm reads the engine from packages/parallax/target, so with
# CARGO_TARGET_DIR set elsewhere, link that folder there first.
set -euo pipefail
package="$(cd "$(dirname "$0")/../../../.." && pwd)"
repo="$(cd "$package/../.." && pwd)"
web="$package/web"
url="http://127.0.0.1:8791"
version="$(cd "$package" && node -p "require('@playwright/test/package.json').version")"

if curl -sf "$url" >/dev/null; then
  echo "ERROR something already answers at $url. Stop it first: the capture must be of the demo this script builds." >&2
  exit 1
fi
if [ "${PARALLAX_PREBUILT:-}" != "1" ]; then
  (cd "$web" && pnpm build:wasm && pnpm build:data && pnpm build)
fi

log="$(mktemp)"
cd "$web"
setsid node projects/demo/serve.mjs --port 8791 >"$log" 2>&1 &
server=$!
trap 'kill -- "-$server" 2>/dev/null || true; rm -f "$log"' EXIT
for _ in $(seq 30); do
  curl -sf "$url" >/dev/null && break
  sleep 1
done
curl -sf "$url" >/dev/null || { echo "ERROR the demo's server did not answer at $url within 30 s:" >&2; cat "$log" >&2; exit 1; }

docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$repo:$repo" -w "$package" "mcr.microsoft.com/playwright:v$version-noble" \
  node_modules/.bin/playwright test -c tests/e2e/pivot/angular/playwright.config.ts "$@"
