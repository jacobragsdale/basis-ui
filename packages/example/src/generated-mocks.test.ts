/* The generated MSW mocks answer what no fixture does in fixture mode, so each must pass its own response schema.
 * orval 8.46 wrote enum picks that never did; `vp run client-pull` repairs them (packages/ui's preset/client.ts). */

import { z } from "zod";
import { describe, expect, test } from "vite-plus/test";

import { Accrual, Bond, DayCount, DirtyPrice, Yield } from "#api/client.ts";
import {
  getAccruedInterestResponseMock200,
  getBondResponseMock200,
  getBondYieldResponseMock200,
  getConventionsResponseMock200,
  getDirtyPriceResponseMock200,
} from "#api/mocks.ts";

/** Each JSON operation's 200 mock, with the schema its response is parsed by. */
const mocks: readonly (readonly [string, () => unknown, z.ZodType])[] = [
  ["accrued_interest", getAccruedInterestResponseMock200, Accrual],
  ["bond", getBondResponseMock200, Bond],
  ["bond_yield", getBondYieldResponseMock200, Yield],
  ["conventions", getConventionsResponseMock200, z.array(DayCount)],
  ["dirty_price", getDirtyPriceResponseMock200, DirtyPrice],
];

const draws = 50;

describe("the generated mocks", () => {
  test.each(mocks)("%s's 200 passes its own schema on every draw", (_operation, mock, schema) => {
    for (let draw = 0; draw < draws; draw += 1) {
      expect(schema.safeParse(mock()).error).toBeUndefined();
    }
  });
});
