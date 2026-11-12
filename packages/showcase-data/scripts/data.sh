#!/usr/bin/env bash
# Writes the data of the API the showcase imagines, into packages/showcase/fixtures/generated/, which git ignores: the
# datasets, with parallax-datagen, as Arrow IPC streams that the fixtures in packages/showcase/fixtures/ name as their
# body_file, 1,000,000 trades and 1,000,000 positions, 600 bonds with their
# spreads, October's P&L explained by factor, and the Treasury curve through 2026; then fixtures.ts writes the JSON
# fixtures those tables answer. Its argument sets the trades' and
# positions' rows, such as `vp run @basis/showcase-data#data 5000` for a test run. It needs the Rust toolchain parallax's build needs.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
showcase="$(cd "$here/../showcase" && pwd)"
parallax="$(cd "$here/../parallax" && pwd)"
out="$showcase/fixtures/generated"
rows="${1:-1000000}"
mkdir -p "$out"
cd "$parallax"
# One rustc job unless the caller says otherwise: parallel jobs run small machines out of memory.
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-1}"
cargo build --release --locked -q -p parallax-datagen
generate() {
  local name="$1"
  shift
  cargo run --release --locked -q -p parallax-datagen -- "$@" --stream --out "$out/$name.arrows"
}
generate trades trades --rows "$rows"
generate positions positions --rows "$rows"
generate bonds bonds --rows 600
generate attribution attribution
generate curves curves
node "$here/scripts/fixtures.ts"
echo "Wrote the showcase's datasets, $rows trades and positions, and their fixtures in fixtures/generated/."
