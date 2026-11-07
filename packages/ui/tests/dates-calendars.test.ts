import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { isBusinessDay, nextBusinessDay, nyse, sifma, target2 } from "#dates/index.ts";
import type { Calendar } from "#dates/index.ts";

const date = (text: string): Temporal.PlainDate => Temporal.PlainDate.from(text);

/** A day as "closed", "open", or the early close's time. */
function shown(calendar: Calendar, text: string): string {
  const day = calendar.day(date(text));
  return day.kind === "early-close" ? day.closes.toString({ smallestUnit: "minute" }) : day.kind;
}

// Written by parallax's Rust calendar; see packages/parallax/crates/parallax-engine/tests/calendar_fixtures.rs.
const rustFixtures = new URL(
  "../../parallax/crates/parallax-engine/tests/fixtures/calendar.json",
  import.meta.url,
);

const isoDate = z.iso.date();
const yearSchema = z.object({
  closed: z.array(isoDate),
  holidays: z.array(isoDate),
  next: z.array(z.tuple([isoDate, isoDate])),
  tradingDays: z.number(),
  year: z.number(),
});

const rustSchema = z.object({
  specialClosures: z.array(z.iso.date()),
  years: z.array(yearSchema),
});
const rustText: unknown = JSON.parse(readFileSync(rustFixtures, "utf8"));
const rust = rustSchema.parse(rustText);

describe("the NYSE against parallax's Rust calendar", () => {
  test("the special closures are the exceptions", () => {
    expect(nyse.exceptions.map((exception) => exception.date)).toStrictEqual(rust.specialClosures);
  });

  describe.each(rust.years.map((year) => [year.year, year] as const))("%i", (year, fixture) => {
    test("closes on the same weekdays", () => {
      const closed: string[] = [];
      let trading = 0;
      for (let day = date(`${String(year)}-01-01`); day.year === year; day = day.add({ days: 1 })) {
        if (isBusinessDay(day, { calendar: nyse })) {
          trading += 1;
        } else if (day.dayOfWeek <= 5) {
          closed.push(day.toString());
        }
      }
      expect(closed).toStrictEqual(fixture.closed);
      expect(trading).toBe(fixture.tradingDays);
    });

    test("the holidays are rule closures", () => {
      const holidays = fixture.holidays.filter(
        (holiday) => !rust.specialClosures.includes(holiday),
      );
      expect(holidays.filter((holiday) => nyse.day(date(holiday)).kind !== "closed")).toStrictEqual(
        [],
      );
    });

    test("the next trading days match", () => {
      const next = fixture.next.map(([day]) => [
        day,
        nextBusinessDay(date(day), { calendar: nyse }).toString(),
      ]);
      expect(next).toStrictEqual(fixture.next);
    });
  });
});

describe("SIFMA's rules", () => {
  test.each([
    ["2022-01-01", "New Year's Day on a Saturday gives no day off", "2021-12-31", "14:00"],
    ["2023-11-11", "Veterans Day on a Saturday gives no day off", "2023-11-10", "open"],
    ["2027-06-19", "Juneteenth on a Saturday closes the Friday", "2027-06-18", "closed"],
    ["2020-07-04", "Independence Day on a Saturday closes the Friday", "2020-07-03", "closed"],
    ["2021-12-25", "Christmas on a Saturday closes the Friday", "2021-12-24", "closed"],
    ["2022-12-25", "Christmas on a Sunday closes the Monday", "2022-12-26", "closed"],
    ["2023-01-01", "New Year's Day on a Sunday closes the Monday", "2023-01-02", "closed"],
    ["2018-11-11", "Veterans Day on a Sunday closes the Monday", "2018-11-12", "closed"],
  ])("%s: %s", (...row) => {
    const [day, expected] = row.slice(2);
    expect(shown(sifma, day ?? "")).toBe(expected);
  });

  test.each([
    ["2026-04-03", "12:00", "2026-04-02", "open"],
    ["2027-03-26", "closed", "2027-03-25", "14:00"],
    ["2034-04-07", "12:00", "2034-04-06", "open"],
    ["2029-03-30", "closed", "2029-03-29", "14:00"],
  ])(
    "Good Friday %s is %s, and the day before %s is %s",
    (...[goodFriday, expected, thursday, before]) => {
      expect([shown(sifma, goodFriday), shown(sifma, thursday)]).toStrictEqual([expected, before]);
    },
  );

  test("closes early at 2 p.m. before Memorial Day, Independence Day, Christmas and New Year's Day", () => {
    expect(
      ["2026-05-22", "2026-07-02", "2026-12-24", "2026-12-31"].map((day) => shown(sifma, day)),
    ).toStrictEqual(["14:00", "14:00", "14:00", "14:00"]);
  });

  test("closes early the day after Thanksgiving, but not the day before", () => {
    expect([shown(sifma, "2026-11-25"), shown(sifma, "2026-11-27")]).toStrictEqual([
      "open",
      "14:00",
    ]);
  });

  test("until April 2009 closed early before Labor Day, Columbus Day and the Wednesday before Thanksgiving", () => {
    expect(
      ["2008-08-29", "2008-10-10", "2008-11-26"].map((day) => shown(sifma, day)),
    ).toStrictEqual(["14:00", "14:00", "14:00"]);
    expect(
      ["2009-09-04", "2009-10-09", "2009-11-25"].map((day) => shown(sifma, day)),
    ).toStrictEqual(["open", "open", "open"]);
  });

  test("closes early on 2025-01-09, the National Day of Mourning the NYSE closed for", () => {
    expect(shown(sifma, "2025-01-09")).toBe("14:00");
    expect(shown(nyse, "2025-01-09")).toBe("closed");
    const day = sifma.day(date("2025-01-09"));
    expect(day.kind === "early-close" ? day.reason : "").toBe(
      "National Day of Mourning for President Carter",
    );
  });

  test("closes on weekends, with a reason", () => {
    expect(sifma.day(date("2026-11-07"))).toStrictEqual({
      date: date("2026-11-07"),
      kind: "closed",
      reason: "Weekend",
    });
  });
});

describe("the NYSE's early closes", () => {
  test.each([
    ["2025-07-03", "13:00"],
    ["2026-07-02", "open"],
    ["2026-11-27", "13:00"],
    ["2026-12-24", "13:00"],
    ["2023-12-22", "open"],
    ["2028-07-03", "13:00"],
  ])("%s is %s", (day, expected) => {
    expect(shown(nyse, day)).toBe(expected);
  });
});

describe("TARGET2's closing days", () => {
  // Easter Monday is three days after Good Friday, which the Rust fixtures give, computed independently, each year.
  const goodFridays = rust.years.map(
    (year) =>
      year.holidays.find(
        (holiday) => date(holiday).dayOfWeek === 5 && [3, 4].includes(date(holiday).month),
      ) ?? "",
  );

  test.each(goodFridays.map((goodFriday) => [goodFriday.slice(0, 4), goodFriday] as const))(
    "%s: the six days, and nothing else",
    (year, goodFriday) => {
      const expected = [
        `${year}-01-01`,
        goodFriday,
        date(goodFriday).add({ days: 3 }).toString(),
        `${year}-05-01`,
        `${year}-12-25`,
        `${year}-12-26`,
      ].filter((day) => date(day).dayOfWeek <= 5);
      const closed: string[] = [];
      for (let day = date(`${year}-01-01`); day.year === Number(year); day = day.add({ days: 1 })) {
        if (day.dayOfWeek <= 5 && !isBusinessDay(day, { calendar: target2 })) {
          closed.push(day.toString());
        }
      }
      expect(closed).toStrictEqual(Number(year) === 2001 ? [...expected, "2001-12-31"] : expected);
    },
  );

  test("a closing day on a weekend gives no day off", () => {
    expect([
      shown(target2, "2022-12-26"),
      shown(target2, "2022-12-27"),
      shown(target2, "2021-12-27"),
    ]).toStrictEqual(["closed", "open", "open"]);
  });

  test("its session is 7:00 to 18:00 in Frankfurt", () => {
    expect(target2.session.zone).toBe("Europe/Berlin");
    expect(target2.session.opens.toString()).toBe("07:00:00");
    expect(target2.session.closes.toString()).toBe("18:00:00");
  });
});

describe("every calendar", () => {
  test.each([sifma, nyse, target2].map((calendar) => [calendar.name, calendar] as const))(
    "%s's exceptions are dated, sourced and in order",
    (_name, calendar) => {
      const dates = calendar.exceptions.map((exception) => exception.date);
      expect(dates).toStrictEqual(dates.toSorted());
      expect(
        calendar.exceptions.filter((exception) => !URL.canParse(exception.source)),
      ).toStrictEqual([]);
      expect(calendar.sources.filter((source) => !URL.canParse(source))).toStrictEqual([]);
    },
  );

  test("states its session hours in its own zone", () => {
    expect(
      [sifma, nyse, target2].map((calendar) => [
        calendar.id,
        calendar.session.zone,
        calendar.session.opens.toString({ smallestUnit: "minute" }),
        calendar.session.closes.toString({ smallestUnit: "minute" }),
      ]),
    ).toStrictEqual([
      ["sifma", "America/New_York", "08:00", "17:00"],
      ["nyse", "America/New_York", "09:30", "16:00"],
      ["target2", "Europe/Berlin", "07:00", "18:00"],
    ]);
  });
});
