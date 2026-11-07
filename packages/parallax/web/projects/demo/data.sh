#!/usr/bin/env bash
# Generates the demo's datasets with parallax-datagen, as Arrow IPC streams in projects/demo/public/data, which the
# demo's build serves beside the app. The same seed and options always give the same rows, which the screenshots in
# e2e/screenshots depend on. Positions and trades are at the browser's row limit; every file must also be within its
# byte limit, MAX_ARROW_BYTES in browser-engine.ts, or the demo could not load it.
set -euo pipefail
web="$(cd "$(dirname "$0")/../.." && pwd)"
out="$web/projects/demo/public/data"
limit="$(sed -n 's/^export const MAX_ARROW_BYTES = \([0-9_]*\);$/\1/p' "$web/projects/parallax/src/lib/browser-engine.ts" | tr -d _)"
[ -n "$limit" ] || { echo "MAX_ARROW_BYTES was not found in browser-engine.ts" >&2; exit 1; }
mkdir -p "$out"
cd "$web/.."
cargo build --release --locked -p parallax-datagen
generate() {
  local name="$1"
  shift
  cargo run --release --locked -q -p parallax-datagen -- "$@" --stream --out "$out/$name.arrows"
  local bytes
  bytes="$(wc -c <"$out/$name.arrows" | tr -d ' ')"
  if [ "$bytes" -gt "$limit" ]; then
    echo "$name.arrows is $bytes bytes of Arrow, more than the $limit a table in the browser holds" >&2
    exit 1
  fi
}
generate positions positions --rows 150000
generate trades trades --rows 150000
generate prices prices --tickers 50
generate book positions --rows 300
generate blotter trades --rows 500
