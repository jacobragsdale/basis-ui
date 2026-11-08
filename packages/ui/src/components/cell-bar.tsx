/* CellBar: a value's bar behind its text in a table cell, so a column of exposures or P&L reads at a glance as well as
 * in digits. The bar is SVG, as wide as the value's magnitude is a share of `max`, the largest in its column. A
 * `signed` column's bars grow both ways from the middle, gains in the gain colour and losses in the loss colour;
 * otherwise they grow from the left. The bar only repeats the text, which it leaves to screen readers. */

import { cn } from "cn";
import type { ComponentProps, ReactElement, ReactNode } from "react";

import { across, barSpan, half } from "./cell-bar-span.ts";

interface CellBarProps extends Omit<ComponentProps<"span">, "children"> {
  /** The value the bar stands for. */
  readonly value: number;
  /** The largest magnitude in the column, which fills the bar's whole room. */
  readonly max: number;
  /** Bars grow both ways from the middle, for a column that holds negative values. */
  readonly signed?: boolean;
  /** Which colour a rise takes in a signed column: gain for a gain, or loss, as a rising yield is to a holder. */
  readonly rising?: "gain" | "loss";
  /** The cell's text, over the bar, such as the value through `Num` or `Money`. */
  readonly children: ReactNode;
}

/** The bar's colour: the chart's first colour from the left, and gain or loss both ways from the middle. */
function barClass(value: number, signed: boolean, rising: "gain" | "loss"): string {
  if (!signed) {
    return "fill-chart-1";
  }
  return value >= 0 === (rising === "gain") ? "fill-gain" : "fill-loss";
}

/** A table cell's text over a bar of its value.
 *
 * @example
 * ```tsx
 * import { CellBar, Num } from "@basis/ui";
 *
 * // A loss of 2.5 million in a column whose largest magnitude is 10 million.
 * <CellBar value={-2_500_000} max={10_000_000} signed>
 *   <Num value={-2_500_000} />
 * </CellBar>;
 * ```
 */
function CellBar({
  value,
  max,
  signed = false,
  rising = "gain",
  className,
  children,
  ...props
}: CellBarProps): ReactElement {
  const { x, width } = barSpan(value, max, signed);
  return (
    <span
      data-slot="cell-bar"
      className={cn("relative flex min-w-16 items-center justify-end", className)}
      {...props}
    >
      <span aria-hidden="true" className="absolute inset-x-0 inset-y-0.5">
        <svg
          viewBox={`0 0 ${String(across)} 10`}
          preserveAspectRatio="none"
          className="block size-full"
        >
          <rect
            x={x}
            y={0}
            width={width}
            height={10}
            className={cn("opacity-30", barClass(value, signed, rising))}
          />
          {signed ? (
            <line
              x1={half}
              x2={half}
              y1={0}
              y2={10}
              className="stroke-border"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
      </span>
      <span className="relative px-1 tabular-nums">{children}</span>
    </span>
  );
}

export { CellBar };
export type { CellBarProps };
