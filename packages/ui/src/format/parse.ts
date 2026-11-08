/* Reads what a person types into a number field, such as `1.5mm`, `250k`, `(1,234.50)` or `25bp`. The text is read
 * exactly, the suffix moving the decimal point in the digits themselves, and only then converted to a double, so
 * `1.1mm` is the double nearest 1,100,000 rather than 1.1 × 1,000,000 rounded twice.
 *
 * Suffixes are declared per field rather than guessed. In bond and muni markets `M` means thousands, so `5M` par is
 * $5,000, while elsewhere `m` means millions; a field states which it means, and the input shows the full number back
 * so the person sees what was read. */

/** Each suffix a field accepts, and the power of ten it multiplies by. Suffixes match without regard to case. */
type Suffixes = Readonly<Record<string, number>>;

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

/** Rates: `%` hundredths and `bp` or `bps` basis points, ten-thousandths. */
const rateSuffixes: Suffixes = Object.fromEntries([
  ["%", hundredths],
  ["bp", tenThousandths],
  ["bps", tenThousandths],
]);

const shape =
  /^(?<sign>[+-]?)(?<whole>\d[\d,]*|)(?:\.(?<fraction>\d*))?\s*(?<suffix>[^\d\s.,+-]*)$/u;

/** A number as typed: its sign, its digits either side of the point, and its suffix in lower case. */
interface Parts {
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

/** The power of ten a suffix multiplies by, if the field accepts it. */
function powerOf(suffix: string, suffixes: Suffixes): Reading<number> {
  if (suffix === "") {
    return { ok: true, value: 0 };
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
  const { fraction, negative, suffix, whole } = parts.value;
  const power = powerOf(suffix, suffixes);
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
 * the text is read exactly, then converted to the nearest double. */
function parseAmount(text: string, suffixes: Suffixes = amountSuffixes): ParseResult {
  const reading = parseAmountText(text, suffixes);
  return reading.ok ? { ok: true, value: Number(reading.value) } : reading;
}

export { amountSuffixes, parSuffixes, parseAmount, parseAmountText, rateSuffixes };
export type { ParseResult, Suffixes };
