/* DateTime: a time by parallax's rules, through the formatter, so it reads as it does in the grid: an instant in New
 * York time unless `zone` names another, a wall-clock time as stored, and a date as it is (date-time-text.ts). It
 * renders a `<time>` whose `dateTime` is the machine-readable value and whose title gives the full instant, offset and
 * zone included, since the shown text drops both. */

import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { dateTimeShown } from "./date-time-text.ts";
import type { DateTimeFormat, DateTimeValue } from "./date-time-text.ts";
import { numVariants as dateTimeVariants } from "./num-variants.ts";

interface DateTimeProps
  extends
    Omit<ComponentProps<"time">, "children" | "dateTime">,
    VariantProps<typeof dateTimeVariants>,
    DateTimeFormat {
  /** The time as the API sends it, ISO 8601 text, or as Temporal holds it; `null` shows the formatter's null text. */
  readonly value: DateTimeValue;
}

/** A time: `2026-11-06 09:30:00` for the instant 14:30 UTC, in tabular figures. `show` picks the date or the time
 * alone, and `precision` adds milliseconds or microseconds.
 *
 * @use For a date, a time or an instant as the API sends it, in New York time unless `zone` names another. For how long
 * ago it was, use relativeTime from `@basis/ui/dates`.
 * @see Num, Formatted, relativeTime
 *
 * @example
 * ```tsx
 * import { DateTime } from "@basis/ui";
 *
 * <DateTime value="2026-11-06T14:30:00Z" />; // 2026-11-06 09:30:00, in New York time
 * ```
 */
function DateTime({
  value,
  zone,
  precision,
  show,
  align,
  className,
  ...props
}: DateTimeProps): ReactElement {
  const shown = dateTimeShown(value, { precision, show, zone });
  return (
    <time
      data-slot="date-time"
      dateTime={shown.dateTime}
      title={shown.title}
      className={cn(dateTimeVariants({ align }), className)}
      {...props}
    >
      {shown.text}
    </time>
  );
}

export { DateTime };
