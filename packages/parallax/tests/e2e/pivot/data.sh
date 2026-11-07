#!/usr/bin/env bash
# Generates the pivot harness's dataset with parallax-datagen, as an Arrow IPC stream in
# tests/e2e/pivot/harness/public/data, which the harness's build serves beside the page: the Angular demo's positions,
# at the browser's row limit, with the same seed, so the pivot's canvas can be compared with the Angular demo's. The
# file must be within the browser's byte limit, maxArrowBytes in src/engine/limits.ts.
set -euo pipefail
package="$(cd "$(dirname "$0")/../../.." && pwd)"
out="$package/tests/e2e/pivot/harness/public/data"
limit="$(sed -n 's/^const maxArrowBytes = \([0-9_]*\);$/\1/p' "$package/src/engine/limits.ts" | tr -d _)"
[ -n "$limit" ] || { echo "ERROR maxArrowBytes was not found in src/engine/limits.ts; update tests/e2e/pivot/data.sh to read it." >&2; exit 1; }
mkdir -p "$out"
cd "$package"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-1}"
cargo run --release --locked -q -p parallax-datagen -- positions --rows 150000 --stream --out "$out/positions.arrows"
bytes="$(wc -c <"$out/positions.arrows" | tr -d ' ')"
if [ "$bytes" -gt "$limit" ]; then
  echo "ERROR positions.arrows is $bytes bytes of Arrow, more than the $limit a table in the browser holds." >&2
  exit 1
fi
