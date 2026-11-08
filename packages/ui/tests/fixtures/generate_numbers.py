# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Writes numbers.json, the cases @basis/ui's sumPrecise is tested against.

The expected values are the exact rational sums of the doubles, rounded once to the nearest double by int division,
which CPython rounds correctly. (The Decimal cases went with the Decimal class on 2026-11-08: every number an API sends
is a double.)

The file records this script's SHA-256, and the TypeScript tests fail when it no longer matches, so a change here
without regenerating the cases is caught. Regenerate from packages/ui with the standard library only:

    uv run tests/fixtures/generate_numbers.py
"""

import hashlib
import json
import math
import random
import struct
from collections.abc import Iterator
from fractions import Fraction
from pathlib import Path

type Json = str | int | float | list[Json]

SEED = 20261107


def random_double(rng: random.Random) -> float:
    """A finite double of any exponent, subnormals included."""
    while True:
        (value,) = struct.unpack("<d", rng.getrandbits(64).to_bytes(8, "little"))
        if math.isfinite(value):
            return value


def exact_double_sum(values: list[float]) -> float:
    """The exact sum rounded once to the nearest double, ties to even, as Math.sumPrecise defines it."""
    if all(value == 0 and math.copysign(1, value) < 0 for value in values):
        return -0.0
    total = sum((Fraction(value) for value in values), Fraction(0))
    try:
        return total.numerator / total.denominator
    except OverflowError:
        return math.inf if total > 0 else -math.inf


def double_lists(rng: random.Random) -> Iterator[list[float]]:
    huge = 1.7976931348623157e308
    yield from [[], [-0.0], [-0.0, -0.0], [-0.0, 0.0], [1.0, -1.0], [0.1] * 10, [1e100, 1.0, -1e100],
                [2.0**53, 1.0, 1.0], [1e16, 1.0, 1e-16], [huge, huge, -huge], [huge, huge], [-huge, -huge * 0.5],
                [8.98846567431158e307, 8.988465674311579e307, -huge], [1e308, 1e308, 0.1, 0.1, 1e30, 0.1, -1e30,
                -1e308, -1e308]]
    yield [1.0 / n for n in range(1, 1001)]
    yield [(-1.0) ** n / n for n in range(1, 1001)]
    for _ in range(300):
        yield [random_double(rng) for _ in range(rng.randint(2, 10))]
    for _ in range(300):
        # Large values that cancel, leaving the small ones a naive sum loses.
        big = [rng.uniform(-1, 1) * 10.0 ** rng.randint(10, 300) for _ in range(rng.randint(1, 4))]
        small = [rng.uniform(-1, 1) * 10.0 ** rng.randint(-20, 5) for _ in range(rng.randint(1, 6))]
        values = [*big, *small, *(-value for value in big)]
        rng.shuffle(values)
        yield values


def json_number(value: float) -> Json:
    return value if math.isfinite(value) else ("Infinity" if value > 0 else "-Infinity")


def sum_precise_cases(rng: random.Random) -> Iterator[list[Json]]:
    for values in double_lists(rng):
        yield [list[Json](values), json_number(exact_double_sum(values))]


def write(path: Path, header: dict[str, str], sections: dict[str, list[Json]]) -> None:
    """One case a line, so a regenerated file diffs by case. Oxfmt leaves the file alone: see vite.config.ts."""
    lines = ["{"]
    lines += [f"  {json.dumps(key)}: {json.dumps(value)}," for key, value in header.items()]
    for index, (name, cases) in enumerate(sections.items()):
        lines.append(f"  {json.dumps(name)}: [")
        lines.append(",\n".join(f"    {json.dumps(case, allow_nan=False)}" for case in cases))
        lines.append("  ]" + ("," if index < len(sections) - 1 else ""))
    lines.append("}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    here = Path(__file__)
    rng = random.Random(SEED)
    sections: dict[str, list[Json]] = {
        "sumPrecise": list(sum_precise_cases(rng)),
    }
    header = {"generator": hashlib.sha256(here.read_bytes()).hexdigest()}
    write(here.with_name("numbers.json"), header, sections)
    counts = ", ".join(f"{name} {len(cases)}" for name, cases in sections.items())
    print(f"Wrote {sum(len(cases) for cases in sections.values())} cases: {counts}")


if __name__ == "__main__":
    main()
