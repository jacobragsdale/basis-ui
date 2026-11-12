/* Writes the fixtures the generated datasets answer, beside them in packages/showcase/fixtures/generated/, which git
 * ignores: each bond's terms and coupon schedule, as `GET /bonds/{cusip}` and `GET /bonds/{cusip}/coupons` answer
 * them, their bodies in files of their own so that the fixtures module stays small; a search for each bond's CUSIP;
 * and the overview, its figures summed from the 1,000,000 positions. data.sh runs it after parallax-datagen. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { tableFromIPC } from "apache-arrow";
import type { Table } from "apache-arrow";

import { couponsOf, isinOf, issuedOf } from "./bonds.ts";
import { decimalOf, overviewOf } from "./overview.ts";

const folder = fileURLToPath(new URL("../../showcase/fixtures/generated/", import.meta.url));
const recordedAt = "2026-10-30T21:00:00Z";
const parScale = 2;
/** A coupon's rate in a security's description, as `5.250%`. */
const couponDecimals = 3;

type Row = Readonly<Record<string, unknown>>;

function read(name: string): Table {
  return tableFromIPC(readFileSync(path.join(folder, `${name}.arrows`)));
}

function write(file: string, value: unknown): void {
  mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
  writeFileSync(path.join(folder, file), `${JSON.stringify(value, undefined, 2)}\n`);
}

/** A fixture record of `request`, answered by `response`. */
function record(operation: string, request: Row, response: Row): Row {
  return {
    format: "basis-ui-fixture/1",
    operation_id: operation,
    recorded_at: recordedAt,
    request,
    response,
  };
}

/** A JSON fixture of `GET requestPath`, its body in `bodies/NAME.body`. */
function writeWithBody(
  operation: string,
  request: { readonly path: string; readonly name: string },
  body: unknown,
): void {
  write(`bodies/${request.name}.body`, body);
  const response = {
    body_file: `bodies/${request.name}.body`,
    media_type: "application/json",
    status: 200,
  };
  write(`${request.name}.json`, record(operation, { method: "GET", path: request.path }, response));
}

function isoDate(milliseconds: number): string {
  return new Date(milliseconds).toISOString().slice(0, "YYYY-MM-DD".length);
}

function bondBody(bond: Row, maturity: string): Row {
  const cusip = String(bond["cusip"]);
  return {
    // Par is a decimal of scale 2, which apache-arrow gives as its integer's words.
    amount_outstanding: decimalOf(bond["par"], parScale),
    coupon_rate: bond["coupon_rate"],
    currency: "USD",
    cusip,
    day_count: "30/360",
    duration: bond["duration"],
    frequency: 2,
    isin: isinOf(cusip),
    issued: issuedOf(maturity, String(bond["tenor_bucket"]), Number(bond["years_to_maturity"])),
    issuer: bond["issuer"],
    maturity,
    price: bond["price"],
    rating: bond["rating"],
    sector: bond["sector"],
    spread: bond["spread"],
    ticker: bond["ticker"],
    yield: bond["yield_to_maturity"],
  };
}

function writeSearch(cusip: string, description: string): void {
  const found = [{ cusip, description, isin: isinOf(cusip) }];
  write(
    `securities-${cusip}.json`,
    record(
      "securities",
      { method: "GET", path: "/securities", query: { id: [cusip] } },
      { body: found, media_type: "application/json", status: 200 },
    ),
  );
}

function writeBond(bond: Row): void {
  const cusip = String(bond["cusip"]);
  const maturity = isoDate(Number(bond["maturity_date"]));
  const body = bondBody(bond, maturity);
  const rate = Number(bond["coupon_rate"]);
  writeWithBody("bond", { name: `bond-${cusip}`, path: `/bonds/${cusip}` }, body);
  writeWithBody(
    "coupons",
    { name: `coupons-${cusip}`, path: `/bonds/${cusip}/coupons` },
    couponsOf(maturity, String(body["issued"]), rate),
  );
  writeSearch(
    cusip,
    `${String(bond["issuer"])} ${(rate * 100).toFixed(couponDecimals)}% ${maturity}`,
  );
}

const bonds = read("bonds");
for (let index = 0; index < bonds.numRows; index += 1) {
  writeBond(bonds.get(index)?.toJSON() ?? {});
}
const overview = overviewOf(read("positions"));
write(
  "overview.json",
  record(
    "overview",
    { method: "GET", path: "/overview" },
    {
      body: overview,
      media_type: "application/json",
      status: 200,
    },
  ),
);
process.stdout.write(
  `Wrote fixtures for ${String(bonds.numRows)} bonds and the overview in fixtures/generated/.\n`,
);
