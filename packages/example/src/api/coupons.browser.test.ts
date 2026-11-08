/* A dataset route through the generated client: `coupons` asks basis for Arrow, and hands the caller the IPC stream as
 * it came, which parallax's grid reads. The stream here is built as basis's contract says it answers one (its
 * docs/contract.md, Datasets as Arrow): a column for each field of the row's model, nullable only where the field may
 * be null, with dates as date32, and every number a float64 that is nullable, since NaN and the infinities arrive as
 * null. */

import {
  DateDay,
  Field,
  Float64,
  RecordBatch,
  Schema,
  Struct,
  Table,
  makeData,
  tableFromIPC,
  tableToIPC,
} from "apache-arrow";
import { describe, expect, test } from "vite-plus/test";

import { worker } from "#test-support.tsx";

import { coupons } from "./client.ts";
import { getCouponsMockHandler, getCouponsMockHandler404 } from "./mocks.ts";

const millisecondsPerDay = 86_400_000;

/** `dates` as date32's days since 1970-01-01. */
function days(...dates: readonly string[]): Int32Array {
  return Int32Array.from(dates, (date) => Date.parse(date) / millisecondsPerDay);
}

/** Two coupons of a bond paying 4.5% twice a year, in Arrow, as basis answers `GET /bonds/{security}/coupons`: each
 * coupon's interest is 2.25 per 100 of face, a nullable float64. */
function couponStream(): Uint8Array<ArrayBuffer> {
  const interest = new Float64();
  const fields = [
    new Field("starts", new DateDay(), false),
    new Field("pays", new DateDay(), false),
    new Field("interest", interest, true),
  ];
  const columns = [
    makeData({
      data: days("2026-05-15", "2026-11-15"),
      length: 2,
      nullCount: 0,
      type: new DateDay(),
    }),
    makeData({
      data: days("2026-11-15", "2027-05-15"),
      length: 2,
      nullCount: 0,
      type: new DateDay(),
    }),
    makeData({
      data: new Float64Array([2.25, 2.25]),
      length: 2,
      nullCount: 0,
      type: interest,
    }),
  ];
  const rows = makeData({ children: columns, length: 2, nullCount: 0, type: new Struct(fields) });
  const table = new Table(new RecordBatch(new Schema(fields), rows));
  // Copied into an ArrayBuffer of its own, which a Blob takes.
  return new Uint8Array(tableToIPC(table, "stream"));
}

describe("a dataset route", () => {
  test("asks for Arrow, and gives the caller the stream as basis answered it", async () => {
    const accepts: (string | null)[] = [];
    const stream = couponStream();
    worker.use(
      getCouponsMockHandler(({ request }) => {
        accepts.push(request.headers.get("accept"));
        return new Blob([stream]);
      }),
    );
    const { data } = await coupons("US91282CRF04");
    expect(accepts).toStrictEqual(["application/vnd.apache.arrow.stream"]);
    expect(new Uint8Array(await data.arrayBuffer())).toStrictEqual(stream);
    const table = tableFromIPC(await data.arrayBuffer());
    expect(table.schema.fields.map(({ name, type }) => `${name}: ${String(type)}`)).toStrictEqual([
      "starts: Date32<DAY>",
      "pays: Date32<DAY>",
      "interest: Float64",
    ]);
    const lastPaid: unknown = table.getChild("pays")?.get(1);
    expect(lastPaid).toBe(Date.parse("2027-05-15"));
  });

  test("answers a problem in JSON whichever was asked for, as an ApiError", async () => {
    worker.use(
      getCouponsMockHandler404({
        status: 404,
        title: "No bond has that ISIN",
        type: "unknown-bond",
      }),
    );
    await expect(coupons("US0000000000")).rejects.toMatchObject({
      name: "ApiError",
      problem: { title: "No bond has that ISIN", type: "unknown-bond" },
      status: 404,
    });
  });
});
