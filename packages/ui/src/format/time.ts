/* Dates and instants as the formatter writes them. Dates never pass through a zone. Instants are shown in a zone,
 * and sub-second digits beyond the shown precision are cut, never rounded, so a time is never shown later than it
 * happened. */

/** Text for a value outside the range a date can show. */
const outOfRangeText = "out of range";

const msPerSecond = 1000;
const msPerDay = 86_400_000;
const microsPerSecond = 1_000_000n;
/** Years are written with at least four digits, and sub-second digits are counted out of six. */
const yearDigits = 4;
const microsDigits = 6;

// The range a date can show: years -9999 to 9999.
const firstDay = Date.parse("-009999-01-01T00:00:00Z") / msPerDay;
const lastDay = Date.parse("9999-12-31T00:00:00Z") / msPerDay;

// The instants a timestamp can show, as jiff bounds them: -009999-01-02T01:59:59Z to 9999-12-30T22:00:00.999999Z.
const firstSecond = BigInt(Date.parse("-009999-01-02T01:59:59Z") / msPerSecond);
const lastSecond = BigInt(Date.parse("9999-12-30T22:00:00Z") / msPerSecond);

/** The civil fields of an instant: year, month, day, hour, minute and second. */
type CivilFields = readonly [number, number, number, number, number, number];

/** The civil fields of an instant, in seconds since the epoch, in some zone. */
type ZoneParts = (seconds: number) => CivilFields;

function pad(value: number, width: number): string {
  return String(Math.abs(value)).padStart(width, "0");
}

function yearText(year: number): string {
  return `${year < 0 ? "-" : ""}${pad(year, yearDigits)}`;
}

/** A date, as days since 1970-01-01, written `YYYY-MM-DD`. */
function dateText(days: number): string {
  if (!Number.isInteger(days) || days < firstDay || days > lastDay) {
    return outOfRangeText;
  }
  const date = new Date(days * msPerDay);
  return `${yearText(date.getUTCFullYear())}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

function utcParts(seconds: number): CivilFields {
  const date = new Date(seconds * msPerSecond);
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ];
}

/** The civil fields of instants in an IANA zone. Throws a `RangeError` for a zone the platform does not know. */
function zonePartsFor(zone: string): ZoneParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
    minute: "numeric",
    month: "numeric",
    second: "numeric",
    timeZone: zone,
    year: "numeric",
  });
  if (zone === "UTC") {
    return utcParts;
  }
  return (seconds) => {
    const fields: Record<string, number> = {};
    for (const part of formatter.formatToParts(new Date(seconds * msPerSecond))) {
      fields[part.type] = Number(part.value);
    }
    return [
      fields["year"] ?? 0,
      fields["month"] ?? 0,
      fields["day"] ?? 0,
      fields["hour"] ?? 0,
      fields["minute"] ?? 0,
      fields["second"] ?? 0,
    ];
  };
}

/** An instant, in microseconds since the epoch, written `YYYY-MM-DD hh:mm:ss` in a zone with `digits` sub-second
 * digits. */
function civilText(micros: bigint, parts: ZoneParts, digits: number): string {
  // The fraction is taken modulo a second, so an instant before the epoch keeps a positive fraction.
  const fraction = ((micros % microsPerSecond) + microsPerSecond) % microsPerSecond;
  const seconds = (micros - fraction) / microsPerSecond;
  if (seconds < firstSecond || seconds > lastSecond) {
    return outOfRangeText;
  }
  const [year, month, day, hour, minute, second] = parts(Number(seconds));
  const text = `${yearText(year)}-${pad(month, 2)}-${pad(day, 2)} ${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}`;
  return digits === 0
    ? text
    : `${text}.${fraction.toString().padStart(microsDigits, "0").slice(0, digits)}`;
}

export { civilText, dateText, outOfRangeText, utcParts, zonePartsFor };
export type { ZoneParts };
