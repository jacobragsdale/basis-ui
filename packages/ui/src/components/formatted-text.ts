/* The text `Formatted` shows for a number by its display format, as a string: what a DataTable's filter matches in a
 * numeric column, so a search finds `5,000,000` or `99-16+` as the cell shows it. */

import type { DisplayFormat } from "#format/display-format.ts";
import type { ThirtySecondsPrecision } from "#numbers/thirty-seconds.ts";

import { bpsText, moneyText, numText, pctText, price32Text } from "./num-text.ts";
import type { NumericValue } from "./num-text.ts";

/** The precision `Price32` shows for each step a format names. */
const precisionOf: Readonly<
  Record<"32nd" | "half" | "quarter" | "eighth", ThirtySecondsPrecision>
> = {
  "32nd": "thirty-seconds",
  eighth: "eighths",
  half: "halves",
  quarter: "quarters",
};

/** A number's text by its display format, as `Formatted` shows it; by `Num`'s defaults without one. */
function formattedText(value: NumericValue, format: DisplayFormat | undefined): string {
  switch (format?.kind) {
    case undefined: {
      return numText(value).text;
    }
    case "money": {
      return moneyText(value, format.currency, { decimals: format.decimals }).text;
    }
    case "pct": {
      return pctText(value, { decimals: format.decimals }).text;
    }
    case "bps": {
      return bpsText(value, { decimals: format.decimals }).text;
    }
    case "price32": {
      return price32Text(value, { precision: precisionOf[format.step ?? "32nd"] }).text;
    }
    case "number":
    case "price": {
      return numText(value, { decimals: format.decimals }).text;
    }
    default: {
      throw new TypeError("A display format has a kind readDisplayFormat does not read.");
    }
  }
}

export { formattedText, precisionOf };
