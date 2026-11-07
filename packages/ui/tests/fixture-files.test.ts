/* Reading an app's fixtures from disk as `vp dev` does, and checking them against its `openapi.json`, and the port
 * `vp dev` serves an app on. */

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { readFixtures } from "#preset/fixture-files.ts";
import { devPort } from "#preset/fixture-mode.ts";

import { example, makeApp, record, removeApp } from "./fixture-app.ts";

let app = "";

beforeAll(() => {
  app = makeApp({
    ".fixtures/conventions.json": record("conventions", "GET /conventions"),
    "fixtures/a.json": record("conventions", "GET /conventions"),
    "fixtures/b/bond.json": record("bond", "GET /bonds/US91282CRF04"),
  });
});

afterAll(() => {
  removeApp(app);
});

/** The problems fixture mode finds in an app with the example's document and `files` in `fixtures/`, as `1.json` and
 * on, each without the fix every line ends with. */
function problemsOfApp(files: readonly string[]): string[] {
  const broken = makeApp(
    Object.fromEntries(files.map((file, index) => [`fixtures/${String(index + 1)}.json`, file])),
  );
  try {
    return readFixtures(broken).problems.map((line) =>
      line.replace(/; correct it by the record format.*$/u, ""),
    );
  } finally {
    removeApp(broken);
  }
}

describe(readFixtures, () => {
  test("reads the records in .fixtures/, then the fixtures in fixtures/, each folder by its files' names", () => {
    const read = readFixtures(app);
    expect(read.problems).toStrictEqual([]);
    expect(read.records.map(({ file }) => file)).toStrictEqual([".fixtures/conventions.json"]);
    expect(read.fixtures.map(({ file }) => file)).toStrictEqual([
      "fixtures/a.json",
      "fixtures/b/bond.json",
    ]);
    expect(readFixtures(app, { records: false }).records).toStrictEqual([]);
  });

  test("the example's committed fixtures fit its openapi.json", () => {
    const read = readFixtures(example, { records: false });
    expect(read.problems).toStrictEqual([]);
    expect(read.fixtures.map(({ record: { operation_id: id } }) => id).toSorted()).toStrictEqual([
      "bond",
      "bond",
      "conventions",
      "coupons",
      "record_settlement",
    ]);
  });

  test("checks each fixture against the operation openapi.json declares, and says what fixes it", () => {
    const arrow = {
      body_base64: "AA==",
      media_type: "application/vnd.apache.arrow.stream",
      status: 200,
    };
    const problems = problemsOfApp([
      "{",
      record("bonds", "GET /bonds/US91282CRF04"),
      record("bond", "GET /api/bonds/US91282CRF04"),
      record("bond", "POST /bonds/US91282CRF04"),
      record("coupons", "GET /bonds/US91282CRF04/coupons"),
      record("conventions", "GET /conventions", arrow),
    ]);
    expect(problems).toStrictEqual([
      expect.stringMatching(/^ERROR fixtures\/1\.json: is not JSON \(/u),
      "ERROR fixtures/2.json: operation_id bonds is not an operation in openapi.json, whose operations are accrued_interest, bond, bond_yield, conventions, coupons, dirty_price, record_settlement",
      "ERROR fixtures/3.json: GET /api/bonds/US91282CRF04 is not operation bond, which is GET /bonds/{security}, and a path leaves out /api",
      "ERROR fixtures/4.json: POST /bonds/US91282CRF04 is not operation bond, which is GET /bonds/{security}",
      "ERROR fixtures/5.json: answers dataset operation coupons with application/json, but basis-ui's client asks a dataset route only for Arrow: its response is the Arrow IPC stream, as body_base64 with media_type application/vnd.apache.arrow.stream",
      "ERROR fixtures/6.json: answers 200 as application/vnd.apache.arrow.stream, but operation conventions answers 200 as application/json",
    ]);
  });
});

describe(devPort, () => {
  test("gives each app's folder a port of its own, the same on every run, from 20000 to 29999", () => {
    const main = devPort("/home/dev/positions-ui");
    const worktree = devPort("/home/dev/positions-ui-worktrees/2.1-blotter");
    expect(devPort("/home/dev/positions-ui")).toBe(main);
    expect(worktree).not.toBe(main);
    for (const port of [main, worktree]) {
      expect(port).toBeGreaterThanOrEqual(20_000);
      expect(port).toBeLessThan(30_000);
    }
  });
});
