# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Writes numbers.json, the cases @basis/ui's Decimal and sumPrecise are tested against.

Python's decimal module computes every Decimal result, in contexts that trap any inexact step, so each expected value
is exact or rounded exactly once. sumPrecise's expected values are the exact rational sums of the doubles, rounded
once to the nearest double by int division, which CPython rounds correctly.

The file records this script's SHA-256, and the TypeScript tests fail when it no longer matches, so a change here
without regenerating the cases is caught. Regenerate from packages/ui with the standard library only:

    uv run tests/fixtures/generate_numbers.py
"""

import hashlib
import json
import math
import random
import struct
from collections.abc import Callable, Iterator
from decimal import (
    MAX_EMAX,
    MIN_EMIN,
    ROUND_05UP,
    ROUND_CEILING,
    ROUND_DOWN,
    ROUND_FLOOR,
    ROUND_HALF_EVEN,
    ROUND_HALF_UP,
    ROUND_UP,
    Context,
    Decimal,
    DivisionByZero,
    Inexact,
    InvalidOperation,
    Overflow,
    Rounded,
)
from fractions import Fraction
from pathlib import Path

type Json = str | int | float | list[Json]

SEED = 20261107
PRECISION = 5000

# @basis/ui's names for Python's rounding modes.
ROUNDINGS: dict[str, str] = {
    "half-away-from-zero": ROUND_HALF_UP,
    "half-even": ROUND_HALF_EVEN,
    "toward-zero": ROUND_DOWN,
    "away-from-zero": ROUND_UP,
    "floor": ROUND_FLOOR,
    "ceiling": ROUND_CEILING,
}

_TRAPS = [InvalidOperation, DivisionByZero, Overflow]
# Addition, subtraction, multiplication and comparison: any rounding at all raises.
EXACT = Context(prec=PRECISION, Emax=MAX_EMAX, Emin=MIN_EMIN, traps=[*_TRAPS, Inexact, Rounded])
# Rounding to a scale, once.
ROUNDING = Context(prec=PRECISION, Emax=MAX_EMAX, Emin=MIN_EMIN, traps=_TRAPS)
# Division keeps far more digits than any scale asks for, rounding 05UP so the final quantize rounds exactly once:
# 05UP keeps a nonzero sticky last digit wherever the discarded digits were nonzero.
DIVIDING = Context(prec=PRECISION, Emax=MAX_EMAX, Emin=MIN_EMIN, rounding=ROUND_05UP, traps=_TRAPS)

DIVISION_SCALES = [0, 1, 2, 4, 6, 8, 12, 20, 34]
ROUNDING_SCALES = [0, 1, 2, 3, 6, 10, 24]
FROM_NUMBER_SCALES = [0, 2, 4, 8, 15, 20]


def plain(value: Decimal) -> str:
    """Plain notation, as Decimal.toString writes it. @basis/ui has no negative zero, so a zero loses its sign."""
    return format(value.copy_abs() if value.is_zero() else value, "f")


def rounded(value: Decimal, scale: int, rounding: str) -> str:
    return plain(value.quantize(Decimal(1).scaleb(-scale), rounding=ROUNDINGS[rounding], context=ROUNDING))


def digits(rng: random.Random, count: int) -> str:
    return "".join(rng.choice("0123456789") for _ in range(count))


def random_decimal(rng: random.Random) -> str:
    """Decimal text in plain notation, from amounts and rates to forty-digit values and tiny fractions."""
    kind = rng.choice(["small", "money", "rate", "large", "tiny", "integer"])
    sign = "-" if rng.random() < 0.4 else ""
    match kind:
        case "small":
            whole, fraction = str(rng.randrange(10**6)), digits(rng, rng.randint(0, 4))
        case "money":
            whole, fraction = str(rng.randrange(10**12)), digits(rng, 2)
        case "rate":
            whole, fraction = str(rng.randrange(3)), digits(rng, rng.randint(4, 10))
        case "large":
            whole, fraction = str(rng.randrange(10**30)), digits(rng, rng.randint(10, 40))
        case "tiny":
            whole, fraction = "0", "0" * rng.randint(5, 30) + digits(rng, rng.randint(1, 8))
        case _:
            whole, fraction = str(rng.randrange(10**18)), ""
    return f"{sign}{whole}.{fraction}" if fraction else f"{sign}{whole}"


def tie(rng: random.Random, scale: int) -> str:
    """A value whose first dropped digit, at a scale, is an exact 5: the case each rounding mode decides."""
    whole = str(rng.randrange(10**rng.randint(0, 8)))
    sign = "-" if rng.random() < 0.5 else ""
    return f"{sign}{whole}.{digits(rng, scale)}5{'0' * rng.randint(0, 2)}"


def near_tie(rng: random.Random, scale: int) -> str:
    """A value just either side of a tie."""
    whole = str(rng.randrange(1000))
    sign = "-" if rng.random() < 0.5 else ""
    return f"{sign}{whole}.{digits(rng, scale)}{rng.choice(['49', '51', '4999999', '5000001'])}"


def parse_cases(rng: random.Random) -> Iterator[list[Json]]:
    fixed = ["0", "-0", "+0", "0.000", "-0.000", ".5", "5.", "-.5", "+7", "007", "00012.3400", "1E+5", "1e-7",
             "1.50E+1", "-1.5e3", "2.5E-0", "123456789012345678901234567890.123456789012345678901234567890"]
    texts = [*fixed, *(random_decimal(rng) for _ in range(400))]
    for _ in range(200):
        mantissa = rng.choice([digits(rng, rng.randint(1, 12)), f"{digits(rng, 3)}.{digits(rng, rng.randint(0, 6))}"])
        exponent = rng.randint(-40, 40)
        mark = rng.choice(["e", "E"])
        sign = rng.choice(["", "-", "+"])
        texts.append(f"{rng.choice(['', '-'])}{mantissa}{mark}{sign if exponent >= 0 else ''}{exponent}")
    for text in texts:
        yield [text, plain(Decimal(text))]


INVALID = ["", ".", "+", "-", "e5", "1e", "1e+", "1.2.3", "1,000", "abc", "--1", "+-1", "0x10", "1 000", "1..5",
           "1e5.5", "$5", "5%"]


def invalid_cases() -> Iterator[Json]:
    for text in INVALID:
        try:
            Decimal(text)
        except InvalidOperation:
            yield text
        else:
            raise AssertionError(f"Python reads {text!r}, so it cannot be a case both refuse")


def pairs(rng: random.Random, count: int) -> Iterator[tuple[str, str]]:
    for _ in range(count):
        yield random_decimal(rng), random_decimal(rng)


def binary_cases(rng: random.Random, operation: Callable[[Decimal, Decimal], Decimal]) -> Iterator[list[Json]]:
    for a, b in pairs(rng, 700):
        yield [a, b, plain(operation(Decimal(a), Decimal(b)))]


def compare_cases(rng: random.Random) -> Iterator[list[Json]]:
    same = [("1.5", "1.50"), ("-0", "0.000"), ("100", "1E+2"), ("-2.10", "-2.1")]
    for a, b in [*same, *pairs(rng, 400)]:
        yield [a, b, int(EXACT.compare(Decimal(a), Decimal(b)))]
    for a, _ in pairs(rng, 100):
        yield [a, a, 0]


def divisors(rng: random.Random) -> Iterator[str]:
    """Divisors that make terminating and repeating quotients, and ones of every shape random_decimal makes."""
    fixed = ["1", "2", "3", "7", "8", "0.25", "0.125", "1.6", "-4", "12", "32", "256", "10000", "0.0001", "-0.3"]
    yield from fixed
    while True:
        text = random_decimal(rng)
        if not Decimal(text).is_zero():
            yield text


def divide(a: Decimal, b: Decimal, scale: int, rounding: str) -> str:
    return rounded(DIVIDING.divide(a, b), scale, rounding)


def division_cases(rng: random.Random) -> Iterator[list[Json]]:
    source = divisors(rng)
    for _ in range(110):
        a, b = random_decimal(rng), next(source)
        for scale in rng.sample(DIVISION_SCALES, 3):
            for rounding in ROUNDINGS:
                yield [a, b, scale, rounding, divide(Decimal(a), Decimal(b), scale, rounding)]
    # Exact ties: a = b × (2k + 1) / (2 × 10^scale), so a / b lands halfway between two values at the scale.
    for _ in range(50):
        b, scale = next(source), rng.choice(DIVISION_SCALES[:6])
        halves = Decimal(2 * rng.randrange(10**6) + 1).scaleb(-scale, context=EXACT)
        a = plain(EXACT.multiply(EXACT.divide(Decimal(b), Decimal(2)), halves))
        for rounding in ROUNDINGS:
            yield [a, b, scale, rounding, divide(Decimal(a), Decimal(b), scale, rounding)]


def rounding_cases(rng: random.Random) -> Iterator[list[Json]]:
    values = [random_decimal(rng) for _ in range(150)]
    for _ in range(120):
        scale = rng.choice(ROUNDING_SCALES[:5])
        values.append(tie(rng, scale) if rng.random() < 0.7 else near_tie(rng, scale))
    values += ["0.5", "-0.5", "1.5", "-1.5", "2.5", "-2.5", "0.05", "-0.005", "2.675", "1.005"]
    for value in values:
        for scale in rng.sample(ROUNDING_SCALES, 2):
            for rounding in ROUNDINGS:
                yield [value, scale, rounding, rounded(Decimal(value), scale, rounding)]


def sum_cases(rng: random.Random) -> Iterator[list[Json]]:
    yield [[], "0"]
    yield [["0.10", "-0.1"], "0.00"]
    for _ in range(200):
        values = [random_decimal(rng) for _ in range(rng.randint(1, 12))]
        total = Decimal(0)
        for value in values:
            total = EXACT.add(total, Decimal(value))
        yield [list[Json](values), plain(total)]


def random_double(rng: random.Random) -> float:
    """A finite double of any exponent, subnormals included."""
    while True:
        (value,) = struct.unpack("<d", rng.getrandbits(64).to_bytes(8, "little"))
        if math.isfinite(value):
            return value


def number_inputs(rng: random.Random) -> list[float]:
    fixed = [2.675, 1.005, 0.1 + 0.2, 1.15, 1.25, -2.5, 0.5, -0.0, 1e21, 1e-7, 5e-324, 2.0**60, 123456.789, -99.995]
    prices = [rng.randrange(-10**7, 10**7) / 1000 for _ in range(120)]
    spread = [rng.uniform(-1, 1) * 10.0 ** rng.randint(-12, 22) for _ in range(120)]
    return [*fixed, *prices, *spread, *(random_double(rng) for _ in range(20))]


def from_number_cases(rng: random.Random) -> Iterator[list[Json]]:
    for value in number_inputs(rng):
        # repr writes the shortest decimal that reads back to the double, as JavaScript's String(value) does.
        exact = Decimal(repr(value))
        for scale in rng.sample(FROM_NUMBER_SCALES, 2):
            for rounding in ROUNDINGS:
                yield [value, scale, rounding, rounded(exact, scale, rounding)]


def to_number_cases(rng: random.Random) -> Iterator[list[Json]]:
    fixed = ["0.1", "2.675", "9007199254740993", "0.30000000000000004", "1" + "0" * 300, "0." + "0" * 320 + "5",
             "-123456789.987654321987654321"]
    for text in [*fixed, *(random_decimal(rng) for _ in range(300))]:
        yield [text, float(Decimal(text))]


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
        "parse": list(parse_cases(rng)),
        "invalid": list(invalid_cases()),
        "add": list(binary_cases(rng, EXACT.add)),
        "sub": list(binary_cases(rng, EXACT.subtract)),
        "mul": list(binary_cases(rng, EXACT.multiply)),
        "compare": list(compare_cases(rng)),
        "div": list(division_cases(rng)),
        "round": list(rounding_cases(rng)),
        "sum": list(sum_cases(rng)),
        "fromNumber": list(from_number_cases(rng)),
        "toNumber": list(to_number_cases(rng)),
        "sumPrecise": list(sum_precise_cases(rng)),
    }
    header = {"generator": hashlib.sha256(here.read_bytes()).hexdigest()}
    write(here.with_name("numbers.json"), header, sections)
    counts = ", ".join(f"{name} {len(cases)}" for name, cases in sections.items())
    print(f"Wrote {sum(len(cases) for cases in sections.values())} cases: {counts}")


if __name__ == "__main__":
    main()
