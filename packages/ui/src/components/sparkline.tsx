/* Sparkline: a series too small for parallax, such as a KPI card's last 30 days or a row's price history, drawn as an
 * SVG line in the space its className gives it. A missing value breaks the line, the last value is marked, and with
 * `trend` the line takes the gain or loss colour by where it ended against where it began. It is an image named by
 * `label`, since a screen reader cannot read a line. */

import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import { sparkGeometry, trendOf } from "./sparkline-geometry.ts";
import type { SparkValue } from "./sparkline-geometry.ts";

/** The box a sparkline is drawn in, which its SVG stretches to the space it is given. */
const box = { height: 24, inset: 2, width: 96 } as const;
/** The last point's radius, in the box's units. */
const dotRadius = 1.75;

interface SparklineProps extends Omit<ComponentProps<"svg">, "children" | "values"> {
  /** The values in order, such as each day's close; null or NaN where one is missing. */
  readonly values: readonly SparkValue[];
  /** What the line shows, for a screen reader, such as "NAV over the last 30 days, up 2.1%". */
  readonly label: string;
  /** Washes the area under the line. */
  readonly area?: boolean;
  /** Colours the line by its trend, first value to last: the gain colour for a rise, the loss colour for a fall. */
  readonly trend?: boolean;
  /** Which colour a rise takes with `trend`: the gain colour, or the loss colour, as a rising yield is to a holder. */
  readonly rising?: "gain" | "loss";
}

/** The class a sparkline's trend colours it with, or none: then the line takes the text colour, which className can
 * set, such as `text-chart-2`. */
function trendClass(values: readonly SparkValue[], rising: "gain" | "loss"): string {
  const trend = trendOf(values);
  if (trend === "flat") {
    return "text-muted-foreground";
  }
  return (trend === "up") === (rising === "gain") ? "text-gain" : "text-loss";
}

/** A small line of `values`, 96 by 24 pixels unless className sizes it, such as `h-8 w-full`.
 *
 * @use For a series too small to load parallax for, such as a KPI card's last 30 days. For axes, tooltips or more than
 * a line, use parallax's Chart.
 * @see Card, CellBar, Chart
 *
 * @example
 * ```tsx
 * import { Sparkline } from "@basis/ui";
 *
 * // A KPI's last ten days, a day missing, coloured by its trend.
 * <Sparkline
 *   label="NAV over ten days, up"
 *   values={[101.2, 101.5, 101.1, null, 102, 102.4, 102.1, 102.8, 103, 103.3]}
 *   trend
 *   area
 * />;
 * ```
 */
function Sparkline({
  values,
  label,
  area = false,
  trend = false,
  rising = "gain",
  className,
  ...props
}: SparklineProps): ReactElement {
  const geometry = sparkGeometry(values, box);
  return (
    <svg
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an inline SVG drawn from data cannot be an <img>; role="img" makes it one image, which some screen readers otherwise read part by part.
      role="img"
      viewBox={`0 0 ${String(box.width)} ${String(box.height)}`}
      preserveAspectRatio="none"
      data-slot="sparkline"
      className={cn(
        "h-6 w-24 shrink-0 overflow-visible",
        trend && trendClass(values, rising),
        className,
      )}
      {...props}
    >
      <title>{label}</title>
      {area && geometry.area !== "" ? (
        <path d={geometry.area} className="fill-current opacity-15" stroke="none" />
      ) : null}
      <path
        d={geometry.line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {geometry.last === null ? null : (
        <circle cx={geometry.last.x} cy={geometry.last.y} r={dotRadius} className="fill-current" />
      )}
    </svg>
  );
}

export { Sparkline };
export type { SparklineProps };
