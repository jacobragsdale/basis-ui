#!/usr/bin/env bash
# Writes the demo's datasets with parallax-datagen, as Arrow IPC streams in public/data, which the build copies beside
# the app and each page fetches as an app fetches its API's Arrow. They are the Angular demo's datasets, with the same
# seed and options, so the same rows: 150,000 positions and 150,000 trades at the browser's row limit, daily prices for
# 50 tickers, the small tables' 300 positions and 500 trades, and 600 bonds for the fixed-income page. Every file must
# also be within the browser's byte limit, maxArrowBytes in @basis/parallax's src/engine/limits.ts.
set -euo pipefail
demo="$(cd "$(dirname "$0")/.." && pwd)"
parallax="$(cd "$demo/../parallax" && pwd)"
out="$demo/public/data"
limit="$(sed -n 's/^const maxArrowBytes = \([0-9_]*\);$/\1/p' "$parallax/src/engine/limits.ts" | tr -d _)"
[ -n "$limit" ] || { echo "ERROR maxArrowBytes was not found in packages/parallax/src/engine/limits.ts; update packages/parallax-demo/scripts/data.sh to read it." >&2; exit 1; }
mkdir -p "$out"
cd "$parallax"
# One rustc job unless the caller says otherwise, as the engine's build does: parallel jobs run small machines out of
# memory.
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-1}"
cargo build --release --locked -p parallax-datagen
generate() {
  local name="$1"
  shift
  cargo run --release --locked -q -p parallax-datagen -- "$@" --stream --out "$out/$name.arrows"
  local bytes
  bytes="$(wc -c <"$out/$name.arrows" | tr -d ' ')"
  if [ "$bytes" -gt "$limit" ]; then
    echo "ERROR $name.arrows is $bytes bytes of Arrow, more than the $limit a table in the browser holds." >&2
    exit 1
  fi
}
generate positions positions --rows 150000
generate trades trades --rows 150000
generate prices prices --tickers 50
generate book positions --rows 300
generate blotter trades --rows 500
generate bonds bonds --rows 600
