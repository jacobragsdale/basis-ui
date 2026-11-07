/* Arrow in fixture mode: a committed fixture and a record each serve real Arrow bytes, which apache-arrow reads as
 * parallax's grid does, and a request for Arrow that no fixture holds gets a problem, never orval's random bytes. */

import {
  DateDay,
  Decimal,
  Field,
  RecordBatch,
  Schema,
  Struct,
  Table,
  makeData,
  tableFromIPC,
  tableToIPC,
} from "apache-arrow";
import { describe, expect, test } from "vite-plus/test";

import { coupons } from "#api/client.ts";
import { fixtureMode, record } from "#fixture-mode-support.ts";

const millisecondsPerDay = 86_400_000;

/** `values` as date32's days since 1970-01-01. */
function days(...values: readonly string[]): Int32Array {
  return Int32Array.from(values, (date) => Date.parse(date) / millisecondsPerDay);
}

/** Two coupons of a bond paying 4.5% twice a year, as basis answers its coupons in Arrow: date32 dates and the
 * interest per 100 of face as a decimal128(12, 2), none nullable. */
function couponStream(): Uint8Array {
  const interest = new Decimal(2, 12, 128);
  const fields = [
    new Field("starts", new DateDay(), false),
    new Field("pays", new DateDay(), false),
    new Field("interest", interest, false),
  ];
  const starts = days("2026-05-15", "2026-11-15");
  const pays = days("2026-11-15", "2027-05-15");
  const hundredths = new Uint32Array([225, 0, 0, 0, 225, 0, 0, 0]);
  const columns = [
    makeData({ data: starts, length: 2, type: new DateDay() }),
    makeData({ data: pays, length: 2, type: new DateDay() }),
    makeData({ data: hundredths, length: 2, type: interest }),
  ];
  const rows = makeData({ children: columns, length: 2, type: new Struct(fields) });
  const batch = new RecordBatch(new Schema(fields), rows);
  return tableToIPC(new Table(batch), "stream");
}

/** `bytes` in base64, as a record holds an Arrow body. */
function base64Of(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(""));
}

describe("Arrow in fixture mode", () => {
  test("the committed coupons fixture is a real Arrow stream of the bond's twenty coupons", async () => {
    const answers = fixtureMode();
    const { data, headers } = await coupons("US91282CRF04");
    expect(headers.get("content-type")).toBe("application/vnd.apache.arrow.stream");
    const table = tableFromIPC(await data.arrayBuffer());
    expect(table.schema.fields.map(({ name, type }) => `${name}: ${String(type)}`)).toStrictEqual([
      "starts: Date32<DAY>",
      "pays: Date32<DAY>",
      "interest: Decimal[12e+2]",
    ]);
    expect(table.numRows).toBe(20);
    const firstPaid: unknown = table.getChild("pays")?.get(0);
    const lastPaid: unknown = table.getChild("pays")?.get(19);
    expect([firstPaid, lastPaid]).toStrictEqual([
      Date.parse("2026-11-15"),
      Date.parse("2036-05-15"),
    ]);
    expect(answers).toMatchObject([{ file: "fixtures/bond-US91282CRF04-coupons.json" }]);
  });

  test("a record's Arrow reaches the caller byte for byte", async () => {
    const stream = couponStream();
    const answers = fixtureMode({
      ".fixtures/coupons.json": record(
        "coupons",
        { path: "/bonds/US91282CRF04/coupons" },
        {
          body_base64: base64Of(stream),
          headers: { vary: "Accept" },
          media_type: "application/vnd.apache.arrow.stream",
          status: 200,
        },
      ),
    });
    const { data } = await coupons("US91282CRF04");
    const bytes = new Uint8Array(await data.arrayBuffer());
    expect(bytes).toStrictEqual(new Uint8Array(stream));
    const lastPaid: unknown = tableFromIPC(bytes).getChild("pays")?.get(1);
    expect(lastPaid).toBe(Date.parse("2027-05-15"));
    expect(answers).toMatchObject([{ source: "record" }]);
  });

  test("a request for Arrow no fixture holds is answered with a problem, never orval's random bytes", async () => {
    const answers = fixtureMode();
    await expect(coupons("US0000000001")).rejects.toMatchObject({
      name: "ApiError",
      problem: { title: "No fixture answers this request", type: "fixture-missing" },
      status: 501,
    });
    expect(answers).toMatchObject([{ source: "none", status: 501 }]);
  });
});
