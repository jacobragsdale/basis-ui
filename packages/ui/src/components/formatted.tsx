/* Formatted: a number shown by the display format its API declares for it, through the number component that kind
 * takes, so a page never chooses decimals: `<Formatted value={row.interest} format={displayFormats.CouponRow.interest}
 * />`. */

import type { ComponentProps, ReactElement } from "react";

import type { DisplayFormat } from "#format/display-format.ts";
import type { ThirtySecondsPrecision } from "#numbers/thirty-seconds.ts";

import { Bps, Money, Num, Pct, Price32 } from "./num.tsx";
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

interface FormattedProps extends Pick<
  ComponentProps<typeof Num>,
  "align" | "signed" | "className" | "id" | "title"
> {
  /** The number, a double as the API sends it. */
  readonly value: NumericValue;
  /** The display format the API declares for it; without one, the number shows by `Num`'s defaults. */
  readonly format?: DisplayFormat | undefined;
}

/** A number shown by its API's display format, through `Num`, `Money`, `Pct`, `Bps` or `Price32` as its kind says.
 *
 * @example
 * ```tsx
 * import { Formatted } from "@basis/ui";
 *
 * <Formatted value={2.0625} format={{ decimals: 4, kind: "price" }} />; // 2.0625
 * <Formatted value={0.0525} format={{ kind: "pct" }} />; // 5.25%
 * <Formatted value={1250} format={{ currency: "EUR", kind: "money" }} />; // €1,250.00
 * ```
 */
function Formatted({ value, format, ...props }: FormattedProps): ReactElement {
  if (format === undefined) {
    return <Num value={value} {...props} />;
  }
  switch (format.kind) {
    case "money": {
      return (
        <Money value={value} currency={format.currency} decimals={format.decimals} {...props} />
      );
    }
    case "pct": {
      return <Pct value={value} decimals={format.decimals} {...props} />;
    }
    case "bps": {
      return <Bps value={value} decimals={format.decimals} {...props} />;
    }
    case "price32": {
      return <Price32 value={value} precision={precisionOf[format.step ?? "32nd"]} {...props} />;
    }
    case "number":
    case "price": {
      return <Num value={value} decimals={format.decimals} {...props} />;
    }
    default: {
      throw new TypeError("A display format has a kind readDisplayFormat does not read.");
    }
  }
}

export { Formatted };
