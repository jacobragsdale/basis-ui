import { describe, expect, test } from "vite-plus/test";

import { isStale, relativeTime } from "#dates/index.ts";

const now = Temporal.Instant.from("2026-11-07T15:00:00Z");
const ago = (duration: Temporal.DurationLike): Temporal.Instant => now.subtract(duration);

describe("relativeTime", () => {
  test.each([
    [{ seconds: 0 }, "now"],
    [{ seconds: 45 }, "45 sec. ago"],
    [{ minutes: 4 }, "4 min. ago"],
    [{ minutes: 4, seconds: 59 }, "4 min. ago"],
    [{ hours: 2, minutes: 30 }, "2 hr. ago"],
    [{ hours: 24 }, "yesterday"],
    [{ hours: 72 }, "3 days ago"],
  ])("%o is %j", (duration, expected) => {
    expect(relativeTime(ago(duration), { now })).toBe(expected);
  });

  /* Now is Friday 2026-11-13 10:00 in New York: a day ago by the calendar is yesterday, however many hours. */
  test.each([
    ["2026-11-12T09:59-05:00[America/New_York]", "yesterday"],
    ["2026-11-11T10:01-05:00[America/New_York]", "2 days ago"],
    ["2026-11-11T23:30-05:00[America/New_York]", "2 days ago"],
    ["2026-11-12T00:30-05:00[America/New_York]", "yesterday"],
  ])("%s is %j, by the days on New York's calendar", (stamp, expected) => {
    const friday = Temporal.ZonedDateTime.from(
      "2026-11-13T10:00-05:00[America/New_York]",
    ).toInstant();
    expect(relativeTime(Temporal.ZonedDateTime.from(stamp).toInstant(), { now: friday })).toBe(
      expected,
    );
  });

  test("a time ahead of the clock reads as now", () => {
    expect(relativeTime(now.add({ seconds: 5 }), { now })).toBe("now");
  });

  test("the style and locale can be chosen", () => {
    expect(relativeTime(ago({ minutes: 4 }), { now, style: "long" })).toBe("4 minutes ago");
    expect(relativeTime(ago({ minutes: 4 }), { now, style: "narrow" })).toBe("4m ago");
    expect(relativeTime(ago({ minutes: 4 }), { locale: "en-GB", now })).toBe("4 min ago");
  });

  test("measures from the clock by default", () => {
    expect(relativeTime(Temporal.Now.instant())).toBe("now");
  });
});

describe("isStale", () => {
  test.each([
    [{ minutes: 4 }, { minutes: 5 }, false],
    [{ minutes: 5 }, { minutes: 5 }, false],
    [{ minutes: 5, seconds: 1 }, { minutes: 5 }, true],
    [{ hours: 25 }, { days: 1 }, true],
  ])("%o old, with a threshold of %o, is stale: %s", (age, threshold, expected) => {
    expect(isStale(ago(age), { now, threshold })).toBe(expected);
  });

  test.each([
    [{ hours: 6 * 24 }, { weeks: 1 }, false],
    [{ hours: 8 * 24 }, { weeks: 1 }, true],
    [{ hours: 27 * 24 }, { months: 1 }, false],
    [{ hours: 32 * 24 }, { months: 1 }, true],
  ])(
    "%o old, with a threshold of %o in weeks or months, is stale: %s, never throwing",
    (age, threshold, expected) => {
      expect(isStale(ago(age), { now, threshold })).toBe(expected);
    },
  );

  test("takes a Temporal.Duration", () => {
    expect(
      isStale(ago({ minutes: 10 }), { now, threshold: Temporal.Duration.from({ minutes: 5 }) }),
    ).toBe(true);
  });
});
