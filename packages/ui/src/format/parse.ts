// Reads what a person types into a number field, such as `1.5mm`, `250k`, `(1,234.50)` or `25bp`, into an exact
// decimal string, never a double, so a price or a par amount reaches the API with every digit it was given.
//
// Suffixes are declared per field rather than guessed. In bond and muni markets `M` means thousands, so `5M` par is
// $5,000, while elsewhere `m` means millions; a field states which it means, and the input shows the full number back
// so the person sees what was read.

/** Each suffix a field accepts, and the power of ten it multiplies by. Suffixes match without regard to case. */
export type Suffixes = Readonly<Record<string, number>>;

/** Amounts: `k` thousands, `m` and `mm` millions, `b` and `bn` billions. */
export const amountSuffixes: Suffixes = { k: 3, m: 6, mm: 6, b: 9, bn: 9 };

/** Amounts in bond-market style, where `m` means thousands and `mm` millions. */
export const parSuffixes: Suffixes = { m: 3, mm: 6, bn: 9 };

/** Rates: `%` hundredths and `bp` or `bps` basis points, ten-thousandths. */
export const rateSuffixes: Suffixes = { "%": -2, bp: -4, bps: -4 };

export type ParseResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: string };

const shape =
  /^(?<sign>[+-]?)(?<whole>\d[\d,]*|)(?:\.(?<fraction>\d*))?\s*(?<suffix>[^\d\s.,+-]*)$/u;

/** Reads `text` into an exact decimal string such as `1500000` or `-0.0025`, or says why it cannot. Thousands
 * separators must group correctly, parentheses mean a negative, and a suffix must be one the field accepts. */
export function parseAmount(text: string, suffixes: Suffixes = amountSuffixes): ParseResult {
  let body = text.trim();
  if (body === "") {
    return { ok: false, reason: "Enter a number." };
  }
  let negative = false;
  if (body.startsWith("(") && body.endsWith(")")) {
    negative = true;
    body = body.slice(1, -1).trim();
  }
  const match = shape.exec(body);
  const groups = match?.groups;
  if (groups === undefined) {
    return { ok: false, reason: `"${text}" is not a number.` };
  }
  const whole = groups["whole"] ?? "";
  const fraction = groups["fraction"] ?? "";
  if (whole === "" && fraction === "") {
    return { ok: false, reason: `"${text}" has no digits.` };
  }
  if (whole.includes(",") && !/^\d{1,3}(?:,\d{3})*$/u.test(whole)) {
    return {
      ok: false,
      reason: `"${text}" has commas in the wrong places; group digits in threes.`,
    };
  }
  if (groups["sign"] === "-") {
    if (negative) {
      return { ok: false, reason: `"${text}" is negative twice.` };
    }
    negative = true;
  }
  const suffix = (groups["suffix"] ?? "").toLowerCase();
  let shift = 0;
  if (suffix !== "") {
    const declared = Object.entries(suffixes).find(([name]) => name.toLowerCase() === suffix);
    if (declared === undefined) {
      const accepted = Object.keys(suffixes).join(", ");
      return {
        ok: false,
        reason: `"${suffix}" is not a suffix this field accepts${accepted ? `: use ${accepted}` : ""}.`,
      };
    }
    [, shift] = declared;
  }
  return {
    ok: true,
    value: decimalText(negative, whole.replaceAll(",", "") + fraction, fraction.length - shift),
  };
}

/** Writes `digits × 10^-scale` as plain decimal text, without exponent, leading zeros or trailing fractional zeros. */
function decimalText(negative: boolean, digits: string, scale: number): string {
  let text: string;
  if (scale <= 0) {
    text = digits + "0".repeat(-scale);
  } else {
    const padded = digits.padStart(scale + 1, "0");
    text = `${padded.slice(0, padded.length - scale)}.${padded.slice(padded.length - scale)}`;
  }
  text = text.replace(/^0+(?=\d)/u, "");
  if (text.includes(".")) {
    text = text.replace(/0+$/u, "").replace(/\.$/u, "");
  }
  const isZero = /^[0.]*$/u.test(text);
  return negative && !isZero ? `-${text}` : text;
}
