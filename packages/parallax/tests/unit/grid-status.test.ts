/* What a grid's status bar says of when its data is from: the date the page gives, or else the time the source was
 * read and how long ago, and never the time the browser loaded the table, which would make days-old data look
 * current. The browser tests check the bar on a real grid. */

import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vite-plus/test";

import { asOfDate, asOfOf, asOfText, detailsOf } from "#grid/status.ts";
import { TableStatusSchema } from "#proto/parallax_pb.ts";

const microsPerMilli = 1000n;
/** 2026-11-09 14:30:00 in New York, when the browser loaded the table. */
const loadedMs = Date.UTC(2026, 10, 9, 19, 30);
/** 2026-11-06 17:00:00 in New York, when the source was read. */
const readMs = Date.UTC(2026, 10, 6, 22, 0);
const status = create(TableStatusSchema, {
  loadVersion: 1n,
  loadedAtMicros: BigInt(loadedMs) * microsPerMilli,
  rows: 6n,
});
const tenMinutes = 600_000;

/** About this data's value for `term`. */
function about(asOf: ReturnType<typeof asOfOf>, term: string): string | undefined {
  return detailsOf({ asOf, dataset: "positions", rows: "6 rows", status }).find(
    (item) => item.term === term,
  )?.value;
}

describe("the status bar's as of", () => {
  test("says nothing of when the data is from when the source gave no time, and About keeps the load's time", () => {
    // A time of zero means the source gave none.
    const read = asOfOf(0n);
    expect(read).toBeNull();
    expect(asOfText(null, read, loadedMs + tenMinutes)).toBeNull();
    expect(about(read, "Loaded at")).toBe("2026-11-09 14:30:00 New York");
    expect(about(read, "Source read at")).toBe("unknown");
  });

  test("tells the source's time and its age when the page gives no date", () => {
    const read = asOfOf(BigInt(readMs) * microsPerMilli);
    expect(asOfText(null, read, readMs + tenMinutes)).toStrictEqual({
      text: "as of 2026-11-06 17:00:00 · 10 min ago",
      title: "Source read at 2026-11-06 17:00:00 New York time",
    });
  });

  test("tells the page's date alone, with no age, and the source's time moves to About this data", () => {
    const read = asOfOf(BigInt(readMs) * microsPerMilli);
    expect(asOfText("2026-11-06", read, loadedMs)).toStrictEqual({
      text: "as of 2026-11-06",
      title: "The data is for 2026-11-06. Source read at 2026-11-06 17:00:00 New York time",
    });
    expect(asOfText("2026-11-06", null, loadedMs)).toStrictEqual({
      text: "as of 2026-11-06",
      title: "The data is for 2026-11-06",
    });
    expect(about(read, "Source read at")).toBe("2026-11-06 17:00:00");
  });
});

describe("asOf, the date the page gives", () => {
  test("takes a calendar date as YYYY-MM-DD, and no date as none", () => {
    expect(asOfDate("2026-11-06")).toStrictEqual({ date: "2026-11-06", ok: true });
    expect(asOfDate("2028-02-29")).toStrictEqual({ date: "2028-02-29", ok: true });
    expect(asOfDate()).toStrictEqual({ date: null, ok: true });
  });

  test.each([
    ["11/06/2026", 'ERROR asOf "11/06/2026" is not a YYYY-MM-DD date'],
    ["2026-11-06T00:00:00Z", 'ERROR asOf "2026-11-06T00:00:00Z" is not a YYYY-MM-DD date'],
    ["", 'ERROR asOf "" is not a YYYY-MM-DD date'],
    ["2026-02-29", 'ERROR asOf "2026-02-29" is no day of the calendar'],
    ["2026-13-01", 'ERROR asOf "2026-13-01" is no day of the calendar'],
  ])("refuses %j with one ERROR line that ends with the fix", (value, reason) => {
    const checked = asOfDate(value);
    expect(checked.ok).toBe(false);
    const said = checked.ok ? "" : checked.reason;
    expect(said.startsWith(reason)).toBe(true);
    expect(said).toMatch(
      /: pass the date the data is for as YYYY-MM-DD, such as "2026-11-06", or leave asOf out\.$/u,
    );
    expect(said).not.toContain("\n");
  });
});
