/* A number's display format, as an API declares it: basis writes it into each number column's Arrow field metadata,
 * under `basis.format` as compact JSON, and into the API's document as `x-basis-format` on each number property's
 * schema (docs/design.md, Numbers). Parallax's grid, pivot and charts read it from the Arrow they load; `Formatted`
 * and DataTable take the same object, so a page never chooses decimals. Fields this version does not know are
 * ignored, and a kind it does not know is no format, so basis can add to the object. */

import { z } from "zod";

/** The Arrow field metadata key that holds a column's display format. */
const displayFormatMetadata = "basis.format";

/** The most decimals a format may ask for, as basis checks them. */
const maxDecimals = 15;

const decimals = z.number().int().min(0).max(maxDecimals).optional();

/** How a number is shown, by kind: a plain number, money in a currency, a fraction as a percentage or in basis
 * points, a price, or a Treasury price in 32nds to its finest step. */
const displayFormatSchema = z.discriminatedUnion("kind", [
  z.object({ decimals, kind: z.literal("number") }),
  z.object({ currency: z.string().regex(/^[A-Z]{3}$/u), decimals, kind: z.literal("money") }),
  z.object({ decimals, kind: z.literal("pct") }),
  z.object({ decimals, kind: z.literal("bps") }),
  z.object({ decimals, kind: z.literal("price") }),
  z.object({
    kind: z.literal("price32"),
    step: z.enum(["32nd", "half", "quarter", "eighth"]).optional(),
  }),
]);

type DisplayFormat = z.output<typeof displayFormatSchema>;

/** The display format `declared` holds: an object, or the JSON text Arrow metadata holds. `undefined` for anything
 * else, a kind this version does not know included, so the value shows by the formatter's defaults. */
function readDisplayFormat(declared: unknown): DisplayFormat | undefined {
  let value = declared;
  if (typeof declared === "string") {
    try {
      value = JSON.parse(declared);
    } catch {
      return undefined;
    }
  }
  const read = displayFormatSchema.safeParse(value);
  return read.success ? read.data : undefined;
}

export { displayFormatMetadata, displayFormatSchema, readDisplayFormat };
export type { DisplayFormat };
