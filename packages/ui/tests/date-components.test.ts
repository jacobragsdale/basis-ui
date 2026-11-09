/* The rules behind DateTime and the date pickers: the text a time shows, how a typed date is read and why one cannot be
 * picked, the default as-of date, and the range presets. The gallery's browser tests render the components
 * themselves. */

import { describe, expect, test } from "vite-plus/test";

import { dateTimeShown } from "#components/date-time-text.ts";
import { defaultAsOfDate, pickRules, readDate, whyNotPickable } from "#components/date-picking.ts";
import { rangeForPreset } from "#components/date-range-presets.ts";
import { nyse, sifma } from "#dates/index.ts";

const date = (text: string): Temporal.PlainDate => Temporal.PlainDate.from(text);

describe("date and time text", () => {
  const instant = "2026-11-06T14:30:00.123456Z";

  test("an instant shows in New York time, its title the full instant with offset and zone", () => {
    expect(dateTimeShown(instant)).toStrictEqual({
      dateTime: "2026-11-06T14:30:00.123456Z",
      text: "2026-11-06 09:30:00",
      title: "2026-11-06T09:30:00.123456-05:00[America/New_York]",
    });
  });

  test.each([
    {
      format: {},
      name: "a Temporal instant",
      text: "2026-11-06 09:30:00",
      value: Temporal.Instant.from(instant),
    },
    {
      format: { zone: "Europe/London" },
      name: "another zone",
      text: "2026-11-06 14:30:00",
      value: instant,
    },
    {
      format: { precision: "milliseconds" },
      name: "milliseconds, cut",
      text: "2026-11-06 09:30:00.123",
      value: instant,
    },
    { format: { show: "date" }, name: "the date alone", text: "2026-11-06", value: instant },
    { format: { show: "time" }, name: "the time alone", text: "09:30:00", value: instant },
    {
      format: {},
      name: "a zoned time",
      text: "2026-07-01 05:00:00",
      value: "2026-07-01T10:00:00+01:00[Europe/London]",
    },
    { format: {}, name: "a date, as it is", text: "2026-11-06", value: "2026-11-06" },
    {
      format: { show: "time" },
      name: "a Temporal date",
      text: "2026-11-06",
      value: Temporal.PlainDate.from("2026-11-06"),
    },
    {
      format: {},
      name: "a wall-clock time, as stored",
      text: "2026-11-06 09:30:00",
      value: "2026-11-06T09:30:00",
    },
    { format: {}, name: "null", text: "", value: null },
  ] as const)("$name", ({ format, text, value }) => {
    expect(dateTimeShown(value, format).text).toBe(text);
  });

  test("text that is not ISO 8601 shows a dash, its title naming the forms it may take", () => {
    expect(dateTimeShown("06/11/2026")).toStrictEqual({
      dateTime: undefined,
      text: "—",
      title:
        '"06/11/2026" is not an ISO 8601 date or time, such as 2026-11-06, 2026-11-06T14:30:00Z or 2026-11-06T09:30:00-05:00.',
    });
  });

  test("a zone the platform does not know shows a dash, its title saying why", () => {
    const shown = dateTimeShown("2026-11-06T14:30:00Z", { zone: "Mars/Olympus_Mons" });
    expect([shown.text, shown.dateTime]).toStrictEqual(["—", undefined]);
    expect(shown.title).toMatch(/Mars\/Olympus_Mons/u);
  });
});

describe("typed dates", () => {
  test.each([
    ["2026-11-06", "2026-11-06"],
    [" 11/6/2026 ", "2026-11-06"],
    ["2024-02-29", "2024-02-29"],
  ])("%s reads as %s", (text, value) => {
    const reading = readDate(text);
    expect(reading.ok && reading.value.toString()).toBe(value);
  });

  test.each([
    ["2026-02-29", '"2026-02-29" is not a date: February 2026 has 28 days.'],
    ["2026-13-01", '"2026-13-01" is not a date: a year has 12 months.'],
    ["tomorrow", '"tomorrow" is not a date: write it as 2026-11-06 or 11/06/2026.'],
  ])("%s is refused: %s", (text, reason) => {
    expect(readDate(text)).toStrictEqual({ ok: false, reason });
  });
});

describe("what a date field takes", () => {
  const rules = pickRules({
    calendar: sifma,
    max: undefined,
    min: date("2026-01-02"),
    today: date("2026-11-12"),
  });

  test.each([
    [
      "Veterans Day",
      "2026-11-11",
      "2026-11-11 is not a business day on the SIFMA (US bond market) calendar: it closes for Veterans Day.",
    ],
    [
      "a weekend",
      "2026-11-08",
      "2026-11-08 is a Sunday, not a business day on the SIFMA (US bond market) calendar.",
    ],
    [
      "a date after today",
      "2026-11-13",
      "2026-11-13 is after 2026-11-12, the latest date this field takes.",
    ],
    [
      "a date before the earliest",
      "2025-12-31",
      "2025-12-31 is before 2026-01-02, the earliest date this field takes.",
    ],
  ])("refuses %s", (_name, text, reason) => {
    expect(whyNotPickable(date(text), rules)).toBe(reason);
  });

  test("takes a business day, an early close among them", () => {
    expect(whyNotPickable(date("2026-11-10"), rules)).toBeUndefined();
    expect(whyNotPickable(date("2026-01-02"), rules)).toBeUndefined();
  });

  test("follows the calendar the field names: the NYSE trades on Veterans Day", () => {
    const stocks = pickRules({
      calendar: nyse,
      max: null,
      min: undefined,
      today: date("2026-11-12"),
    });
    expect(whyNotPickable(date("2026-11-11"), stocks)).toBeUndefined();
  });

  test("a null latest date leaves the future open", () => {
    const open = pickRules({
      calendar: sifma,
      max: null,
      min: undefined,
      today: date("2026-11-12"),
    });
    expect(whyNotPickable(date("2027-03-01"), open)).toBeUndefined();
  });
});

describe(defaultAsOfDate, () => {
  test.each([
    ["the day before Veterans Day, over it", "2026-11-12", "2026-11-10"],
    ["Friday, over the weekend", "2026-11-09", "2026-11-06"],
    ["the day before, on a business day", "2026-11-06", "2026-11-05"],
    ["the last business day of the year, from New Year's Day", "2027-01-01", "2026-12-31"],
  ])("is %s", (_name, today, asOf) => {
    expect(defaultAsOfDate({ today: date(today) }).toString()).toBe(asOf);
  });
});

describe(rangeForPreset, () => {
  const asOf = date("2026-11-10");

  test.each([
    ["month-to-date", "2026-11-02", "2026-11-10"],
    ["quarter-to-date", "2026-10-01", "2026-11-10"],
    ["year-to-date", "2026-01-02", "2026-11-10"],
    ["prior-month", "2026-10-01", "2026-10-30"],
    ["prior-quarter", "2026-07-01", "2026-09-30"],
    ["prior-year", "2025-01-02", "2025-12-31"],
  ] as const)("%s runs from %s to %s, business days both", (preset, start, end) => {
    const range = rangeForPreset(preset, asOf);
    expect([range.start.toString(), range.end.toString()]).toStrictEqual([start, end]);
    expect(sifma.day(range.start).kind).not.toBe("closed");
    expect(sifma.day(range.end).kind).not.toBe("closed");
  });

  test("an as-of date on a holiday runs to the business day before it", () => {
    const range = rangeForPreset("month-to-date", date("2026-11-11"));
    expect(range.end.toString()).toBe("2026-11-10");
  });
});
