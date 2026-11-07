/* A display format, as parallax's formatter takes it, checked and with its defaults filled in: the decimals, the
 * scaling and what follows the digits, the time zone, and the errors of a format that cannot be used. `format.ts`
 * writes values by these settings. */

import type { ThirtySecondsPrecision } from "#numbers/thirty-seconds.ts";

import { zonePartsFor } from "./time.ts";
import type { ZoneParts } from "./time.ts";

/** A fixed scaling by a thousand, million or billion. The suffix is always shown. */
type Abbreviation = "K" | "M" | "B";

/** How an abbreviation is written: `amount`'s K, M and B, or `par`'s M, MM and BN, as bond markets write par amounts
 * and `parSuffixes` reads them back. */
type SuffixStyle = "amount" | "par";

/** The unit a rate shown in basis points arrives in: a fraction, 0.0025 for 25 bp, or basis points already. */
type BpsUnit = "fraction" | "bp";

/** How negative numbers are written: `-1,234.50` or `(1,234.50)`. */
type Negative = "minus" | "parentheses";

/** The sub-second digits an instant shows. */
type TimePrecision = "seconds" | "milliseconds" | "microseconds";

/** How values are displayed. Unset fields take the value type's default. */
interface Format {
  /** Digits after the decimal point. The default is a decimal's scale, 0 for integers, 1 when abbreviating, 2 for a
   * percentage, and 2 for doubles. */
  readonly decimals?: number | null;
  /** Group thousands with commas; the default is yes. */
  readonly thousands?: boolean | null;
  /** Multiply by 100 and append `%`. */
  readonly percent?: boolean;
  /** Divide by a thousand, million or billion and append the suffix. */
  readonly abbreviate?: Abbreviation | null;
  /** How the abbreviation is written; `amount` unless set. */
  readonly suffixes?: SuffixStyle;
  /** Show a rate in basis points with ` bp`, from the unit it arrives in. */
  readonly bps?: BpsUnit | null;
  /** Show a price in 32nds, `99-16+`, to this finest step. Decimals and thousands do not apply. */
  readonly thirtySeconds?: ThirtySecondsPrecision | null;
  readonly negative?: Negative;
  /** The IANA zone instants are shown in. */
  readonly zone?: string | null;
  readonly precision?: TimePrecision;
}

/** The display zone when a format names none. */
const defaultZone = "America/New_York";
/** The most decimals a format may show, Excel's limit. */
const maxDecimals = 30;
/** Text for a null value. */
const nullText = "";
/** Text for an undefined result, such as NaN or a percentage of zero. */
const undefinedText = "—";

type FormatErrorReason =
  | "unknown-zone"
  | "too-many-decimals"
  | "percent-and-abbreviation"
  | "two-styles";

/** A format that cannot be used. */
class FormatError extends Error {
  public readonly reason: FormatErrorReason;

  public constructor(reason: FormatErrorReason, message: string) {
    super(message);
    this.name = "FormatError";
    this.reason = reason;
  }
}

/** Each abbreviation, the power of ten it divides by, and how par amounts write it. */
const abbreviations = [
  { par: "M", power: 3, suffix: "K" },
  { par: "MM", power: 6, suffix: "M" },
  { par: "BN", power: 9, suffix: "B" },
] as const satisfies readonly {
  readonly par: string;
  readonly power: number;
  readonly suffix: Abbreviation;
}[];

/** A percentage multiplies by 10^2, and basis points of a fraction by 10^4. */
const percentPower = 2;
const bpsPower = 4;
/** What basis points end with, inside the parentheses of a negative, as `Bps` writes them: a no-break space keeps the
 * unit on the number's line. */
const bpSuffix = "\u00A0bp";

/** A checked format with its defaults filled in. */
interface Settings {
  /** The power of ten the shown value is scaled by: up for a percentage, down for an abbreviation. */
  readonly power: number;
  /** The abbreviation or `%` written after the digits. */
  readonly suffix: string;
  readonly decimals: number | undefined;
  readonly percent: boolean;
  readonly abbreviated: boolean;
  readonly bps: BpsUnit | undefined;
  readonly thirtySeconds: ThirtySecondsPrecision | undefined;
  readonly thousands: boolean;
  readonly negative: Negative;
  readonly precision: TimePrecision;
  readonly zone: string;
  readonly zoneParts: ZoneParts;
}

/** The format's decimals, when it sets them. Throws unless they are a count from 0 to 30. */
function checkedDecimals(format: Format): number | undefined {
  const decimals = format.decimals ?? undefined;
  if (
    decimals !== undefined &&
    (!Number.isInteger(decimals) || decimals < 0 || decimals > maxDecimals)
  ) {
    throw new FormatError(
      "too-many-decimals",
      `${String(decimals)} decimals is not a count from 0 to the ${String(maxDecimals)} Excel can show.`,
    );
  }
  return decimals;
}

/** The format's abbreviation, when it sets one. Throws if the format also shows a percentage. */
function checkedAbbreviation(format: Format): Abbreviation | undefined {
  const abbreviation = format.abbreviate ?? undefined;
  if ((format.percent ?? false) && abbreviation !== undefined) {
    throw new FormatError(
      "percent-and-abbreviation",
      "A format cannot both show a percentage and abbreviate.",
    );
  }
  return abbreviation;
}

/** The civil fields of instants in the zone. Throws for a zone the platform does not know. */
function checkedZoneParts(zone: string): ZoneParts {
  try {
    return zonePartsFor(zone);
  } catch {
    throw new FormatError(
      "unknown-zone",
      `Unknown time zone ${zone}: name an IANA zone such as ${defaultZone}.`,
    );
  }
}

/** Refuses a format that shows more than one of a percentage, an abbreviation, basis points and 32nds. */
function checkedStyles(format: Format): void {
  const styles = [
    (format.percent ?? false) && "a percentage",
    (format.abbreviate ?? undefined) !== undefined && "an abbreviation",
    (format.bps ?? undefined) !== undefined && "basis points",
    (format.thirtySeconds ?? undefined) !== undefined && "32nds",
  ].filter((style) => style !== false);
  const [first, second] = styles;
  if (first !== undefined && second !== undefined) {
    throw new FormatError(
      "two-styles",
      `A format shows one of a percentage, an abbreviation, basis points or 32nds, not ${first} and ${second}.`,
    );
  }
}

function powerOf(format: Format, abbreviation: Abbreviation | undefined): number {
  if (format.percent ?? false) {
    return percentPower;
  }
  if (format.bps === "fraction") {
    return bpsPower;
  }
  const found = abbreviations.find(({ suffix }) => suffix === abbreviation);
  return found === undefined ? 0 : -found.power;
}

/** What follows the digits: the abbreviation, as amounts or par amounts write it, `%`, or ` bp`. */
function suffixOf(format: Format, abbreviation: Abbreviation | undefined): string {
  const found = abbreviations.find(({ suffix }) => suffix === abbreviation);
  const abbreviated =
    found === undefined ? "" : found[format.suffixes === "par" ? "par" : "suffix"];
  const percent = (format.percent ?? false) ? "%" : "";
  return `${abbreviated}${percent}${(format.bps ?? undefined) === undefined ? "" : bpSuffix}`;
}

/** Checks a format's decimals, then its abbreviation and styles, then its zone, and fills in its defaults. */
function settingsOf(format: Format): Settings {
  const decimals = checkedDecimals(format);
  const abbreviation = checkedAbbreviation(format);
  checkedStyles(format);
  const percent = format.percent ?? false;
  const zone = format.zone ?? defaultZone;
  return {
    abbreviated: abbreviation !== undefined,
    bps: format.bps ?? undefined,
    decimals,
    negative: format.negative ?? "minus",
    percent,
    power: powerOf(format, abbreviation),
    precision: format.precision ?? "seconds",
    suffix: suffixOf(format, abbreviation),
    thirtySeconds: format.thirtySeconds ?? undefined,
    thousands: format.thousands ?? true,
    zone,
    zoneParts: checkedZoneParts(zone),
  };
}

export {
  FormatError,
  bpSuffix,
  bpsPower,
  defaultZone,
  maxDecimals,
  nullText,
  settingsOf,
  undefinedText,
};
export type {
  Abbreviation,
  BpsUnit,
  Format,
  FormatErrorReason,
  Negative,
  Settings,
  SuffixStyle,
  TimePrecision,
};
