/* The table `vp run new table` writes marks a text column whose field names an identifier, so it sorts by code point,
 * `037833100` before `912828XB1`, and leaves every other column to sort as people read it. */

import { expect, test } from "vite-plus/test";

import { columnLine } from "#preset/scaffold-view.ts";

function textField(
  name: string,
  kind: "text" | "number" = "text",
): Parameters<typeof columnLine>[0] {
  return {
    description: undefined,
    format: undefined,
    kind,
    label: name,
    name,
    nullable: false,
    options: [],
    required: true,
  };
}

test.each(["id", "security_id", "cusip", "isin", "sedol", "issuer_cusip", "tradeId"])(
  "a text column named %s sorts as an identifier",
  (name) => {
    expect(columnLine(textField(name))).toContain("identifier: true");
  },
);

test.each([
  ["issuer", "text"],
  ["paid", "text"],
  ["security_id", "number"],
] as const)("the column %s, of %s, sorts as people read it", (name, kind) => {
  expect(columnLine(textField(name, kind))).not.toContain("identifier");
});
