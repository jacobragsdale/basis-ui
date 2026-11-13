/* Reads what a person types into a number field, such as `1.5mm`, `250k`, `(1,234.50)` or `25bp`. The text is read
 * exactly, the suffix moving the decimal point in the digits themselves, and only then converted to a double, so
 * `1.1mm` is the double nearest 1,100,000 rather than 1.1 × 1,000,000 rounded twice.
 *
 * Suffixes are declared per field rather than guessed. In bond and muni markets `M` means thousands, so `5M` par is
 * $5,000, while elsewhere `m` means millions; a field states which it means, and the input shows the full number back
 * so the person sees what was read. */

/** Where a suffix set keeps the suffix a number must carry: a set that has one, as `rateSuffixes` does, refuses a bare
 * number other than zero, and AmountInput echoes what it read in that suffix's unit. A symbol, so `Object.keys` and a
 * refusal's list of suffixes never see it, while a spread of the set keeps it. */
const unitRequired: unique symbol = Symbol("basis.unitRequired");

/** Each suffix a field accepts, and the power of ten it multiplies by. Suffixes match without regard to case. A set
 * that refuses a bare number, as `rateSuffixes` does, also names the suffix its numbers are echoed in, and a spread of
 * it, `{ ...rateSuffixes, pct: -2 }`, keeps that. */
type Suffixes = Readonly<Record<string, number>> & { readonly [unitRequired]?: string };

/** A value read from typed text, or why it cannot be read. */
type Reading<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly reason: string };

type ParseResult = Reading<number>;

const thousands = 3;
const millions = 6;
const billions = 9;
const hundredths = -2;
const tenThousandths = -4;

// The suffix tables are built from entries, which keep their order, because a refusal lists the suffixes in it.

/** Amounts: `k` thousands, `m` and `mm` millions, `b` and `bn` billions. */
const amountSuffixes: Suffixes = Object.fromEntries([
  ["k", thousands],
  ["m", millions],
  ["mm", millions],
  ["b", billions],
  ["bn", billions],
]);

/** Amounts in bond-market style, where `m` means thousands and `mm` millions. */
const parSuffixes: Suffixes = Object.fromEntries([
  ["m", thousands],
  ["mm", millions],
  ["bn", billions],
]);

/** Rates: `%` hundredths and `bp` or `bps` basis points, ten-thousandths. A rate needs its unit, `5.25%` or `525bp`,
 * since a bare `25` could mean 25%, 25 bp or the fraction 25; a bare `0` is zero in any unit, and stands. An
 * AmountInput echoes a rate as a percentage. */
const rateSuffixes: Suffixes = {
  ...Object.fromEntries([
    ["%", hundredths],
    ["bp", tenThousandths],
    ["bps", tenThousandths],
  ]),
  [unitRequired]: "%",
};

/** The suffix a set's numbers must carry and are echoed in, or `undefined` for a set that takes a bare number. */
function unitOf(suffixes: Suffixes): string | undefined {
  return suffixes[unitRequired];
}

const shape =
  /^(?<sign>[+-]?)(?<number>(?<whole>\d[\d,]*|)(?:\.(?<fraction>\d*))?)\s*(?<suffix>[^\d\s.,+-]*)$/u;

/** A number as typed: its sign, its digits either side of the point, and its suffix in lower case. */
interface Parts {
  /** The number as typed without its suffix, a bracketed one written with a minus, such as `-1,500.5`. */
  readonly written: string;
  readonly negative: boolean;
  readonly whole: string;
  readonly fraction: string;
  readonly suffix: string;
}

function refuse(reason: string): { readonly ok: false; readonly reason: string } {
  return { ok: false, reason };
}

/** Checks the digits and sign `shape` matched. `bracketed` says the text was wrapped in parentheses. */
function checkedParts(
  text: string,
  bracketed: boolean,
  groups: Readonly<Record<string, string | undefined>>,
): Reading<Parts> {
  const whole = groups["whole"] ?? "";
  const fraction = groups["fraction"] ?? "";
  if (whole === "" && fraction === "") {
    return refuse(`"${text}" has no digits.`);
  }
  if (whole.includes(",") && !/^\d{1,3}(?:,\d{3})*$/u.test(whole)) {
    return refuse(`"${text}" has commas in the wrong places; group digits in threes.`);
  }
  const minus = groups["sign"] === "-";
  if (minus && bracketed) {
    return refuse(`"${text}" is negative twice.`);
  }
  return {
    ok: true,
    value: {
      fraction,
      negative: minus || bracketed,
      suffix: (groups["suffix"] ?? "").toLowerCase(),
      whole,
      written: `${bracketed ? "-" : (groups["sign"] ?? "")}${groups["number"] ?? ""}`,
    },
  };
}

/** Splits typed text into its parts. Parentheses mean a negative. */
function partsOf(text: string): Reading<Parts> {
  const trimmed = text.trim();
  if (trimmed === "") {
    return refuse("Enter a number.");
  }
  const bracketed = trimmed.startsWith("(") && trimmed.endsWith(")");
  const body = bracketed ? trimmed.slice(1, -1).trim() : trimmed;
  const groups = shape.exec(body)?.groups;
  if (groups === undefined) {
    return refuse(`"${text}" is not a number.`);
  }
  return checkedParts(text, bracketed, groups);
}

/** Why a bare number needs a unit, with the number written in the set's first two suffixes. */
function needsUnit(text: string, written: string, suffixes: Suffixes): string {
  const examples = Object.keys(suffixes)
    .slice(0, 2)
    .map((suffix) => `${written}${suffix}`);
  return `"${text}" needs a unit: write ${examples.join(" or ")}.`;
}

/** The power of ten a suffix multiplies by, if the field accepts it. A bare number is a power of none, unless the set
 * needs a unit and the number is not zero. */
function powerOf(text: string, parts: Parts, suffixes: Suffixes): Reading<number> {
  const { suffix } = parts;
  if (suffix === "") {
    const zero = /^0*$/u.test(parts.whole.replaceAll(",", "") + parts.fraction);
    return unitOf(suffixes) === undefined || zero
      ? { ok: true, value: 0 }
      : refuse(needsUnit(text, parts.written, suffixes));
  }
  const declared = Object.entries(suffixes).find(([name]) => name.toLowerCase() === suffix);
  if (declared === undefined) {
    const accepted = Object.keys(suffixes).join(", ");
    return refuse(
      `"${suffix}" is not a suffix this field accepts${accepted ? `: use ${accepted}` : ""}.`,
    );
  }
  const [, power] = declared;
  return { ok: true, value: power };
}

/** Writes `digits × 10^-scale` with a decimal point, for a positive scale. */
function withPoint(digits: string, scale: number): string {
  const padded = digits.padStart(scale + 1, "0");
  return `${padded.slice(0, padded.length - scale)}.${padded.slice(padded.length - scale)}`;
}

/** Writes `digits × 10^-scale` as plain decimal text, without exponent, leading zeros or trailing fractional zeros. */
function decimalText(negative: boolean, digits: string, scale: number): string {
  const placed = scale <= 0 ? digits + "0".repeat(-scale) : withPoint(digits, scale);
  const unpadded = placed.replace(/^0+(?=\d)/u, "");
  const text = unpadded.includes(".") ? unpadded.replace(/0+$/u, "").replace(/\.$/u, "") : unpadded;
  const isZero = /^[0.]*$/u.test(text);
  return negative && !isZero ? `-${text}` : text;
}

/** Reads `text` into exact decimal text such as `1500000` or `-0.0025`, or says why it cannot. Thousands separators
 * must group correctly, parentheses mean a negative, and a suffix must be one the field accepts. */
function parseAmountText(text: string, suffixes: Suffixes = amountSuffixes): Reading<string> {
  const parts = partsOf(text);
  if (!parts.ok) {
    return parts;
  }
  const { fraction, negative, whole } = parts.value;
  const power = powerOf(text, parts.value, suffixes);
  if (!power.ok) {
    return power;
  }
  return {
    ok: true,
    value: decimalText(
      negative,
      whole.replaceAll(",", "") + fraction,
      fraction.length - power.value,
    ),
  };
}

/** Reads `text` into the number it means, such as 1500000 for `1.5mm` or 0.0025 for `25bp`, or says why it cannot:
 * the text is read exactly, then converted to the nearest double. A number too large for a double, which would be
 * `Infinity`, is refused. */
function parseAmount(text: string, suffixes: Suffixes = amountSuffixes): ParseResult {
  const reading = parseAmountText(text, suffixes);
  if (!reading.ok) {
    return reading;
  }
  const value = Number(reading.value);
  return Number.isFinite(value)
    ? { ok: true, value }
    : refuse(`"${text}" is too large for a number.`);
}

export { amountSuffixes, parSuffixes, parseAmount, parseAmountText, rateSuffixes, unitOf };
export type { ParseResult, Suffixes };
