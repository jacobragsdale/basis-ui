#!/usr/bin/env bash
# Generates the end-to-end harness's datasets with parallax-datagen, as Arrow IPC streams in tests/e2e/grid/harness/public/data,
# which the harness's build serves beside the page. They are the Angular demo's: the same seed and options give the
# same rows, so the grid's canvas can be compared with the demo's screenshots. Positions and trades are at the
# browser's row limit; every file must also be within its byte limit, maxArrowBytes in src/engine/limits.ts.
set -euo pipefail
package="$(cd "$(dirname "$0")/../../.." && pwd)"
out="$package/tests/e2e/grid/harness/public/data"
limit="$(sed -n 's/^const maxArrowBytes = \([0-9_]*\);$/\1/p' "$package/src/engine/limits.ts" | tr -d _)"
[ -n "$limit" ] || { echo "ERROR maxArrowBytes was not found in src/engine/limits.ts; update tests/e2e/data.sh to read it." >&2; exit 1; }
mkdir -p "$out"
cd "$package"
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
generate book positions --rows 300
generate blotter trades --rows 500
