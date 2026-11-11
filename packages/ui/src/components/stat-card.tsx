/* StatCard: a dashboard's figure. A label, the value in large tabular figures, its change with an arrow and a sign as
 * well as a colour, and a sparkline of its recent values, on a small card. The value is the app's number component,
 * so it is formatted as anywhere else; the change is formatted here, as a percentage, basis points or a number. */

import { cn } from "cn";
import type { ComponentProps, ReactElement, ReactNode } from "react";

import { ArrowDownIcon } from "#vendor/lucide/arrow-down.tsx";
import { ArrowUpIcon } from "#vendor/lucide/arrow-up.tsx";

import { Card, CardContent, CardDescription, CardHeader } from "./card.tsx";
import { bpsText, numText, pctText, signedText } from "./num-text.ts";
import type { NumericValue, Shown } from "./num-text.ts";
import { Skeleton } from "./skeleton.tsx";
import { Sparkline } from "./sparkline.tsx";
import type { SparkValue } from "./sparkline-geometry.ts";

/** A value's change, and how to show it. */
interface StatChange {
  /** The change, as the API sends it: a fraction for `pct`, such as 0.021 for 2.1%. */
  readonly value: NumericValue;
  /** How it is written: a percentage, the default, basis points, or a number like the value's. */
  readonly as?: "pct" | "bps" | "num" | undefined;
  /** Digits after the point; the format's default unless set. */
  readonly decimals?: number | undefined;
  /** What it is measured against, such as "vs yesterday". */
  readonly label?: string | undefined;
  /** Which colour a rise takes: the gain colour, or the loss colour, as a rising yield or a rising loss is to the desk. */
  readonly rising?: "gain" | "loss" | undefined;
}

interface StatCardProps extends Omit<ComponentProps<"div">, "children"> {
  /** What the figure is, such as "NAV". */
  readonly label: string;
  /** The figure, as one of the number components, such as `<Money value={nav} abbreviate="M" />`. */
  readonly value: ReactNode;
  /** The figure's change, with an arrow and a sign beside its colour. */
  readonly change?: StatChange | undefined;
  /** Its recent values, oldest first, drawn as a sparkline under it, coloured by its trend as the change is. */
  readonly trend?: readonly SparkValue[] | undefined;
  /** What the sparkline shows, for a screen reader, such as "NAV over the last 30 days"; the label unless set. */
  readonly trendLabel?: string | undefined;
  /** A line under the figure, such as the time it is as of. */
  readonly footnote?: ReactNode;
  /** Shows a skeleton of the figure, its change and its trend while the data loads. */
  readonly loading?: boolean | undefined;
}

/** The change's text by its kind. */
function changeText({ value, as = "pct", decimals }: StatChange): Shown {
  const format = decimals === undefined ? {} : { decimals };
  if (as === "bps") {
    return bpsText(value, format);
  }
  return as === "num" ? numText(value, format) : pctText(value, format);
}

/** The colour of a change: the gain colour where its direction is the good one, the loss colour where not, and muted
 * for none. */
function toneOf({ direction }: Shown, rising: "gain" | "loss"): string {
  if (direction === "none") {
    return "text-muted-foreground";
  }
  return (direction === "gain") === (rising === "gain") ? "text-gain" : "text-loss";
}

/** The change: an arrow for its direction, its signed text in the colour its direction means here, and what it is
 * against. No change takes no arrow and no colour. */
function Change({ change }: { readonly change: StatChange }): ReactElement {
  const shown = changeText(change);
  const tone = toneOf(shown, change.rising ?? "gain");
  return (
    <p data-slot="stat-card-change" className="flex items-center gap-1 text-xs">
      <span
        data-direction={shown.direction}
        className={cn("flex items-center gap-0.5 font-medium", tone)}
      >
        {shown.direction === "gain" ? <ArrowUpIcon aria-hidden="true" className="size-3" /> : null}
        {shown.direction === "loss" ? (
          <ArrowDownIcon aria-hidden="true" className="size-3" />
        ) : null}
        {signedText(shown.text, shown.direction)}
      </span>
      {change.label === undefined ? null : (
        <span className="text-muted-foreground">{change.label}</span>
      )}
    </p>
  );
}

/** The figure's parts while it loads. */
function Loading({ trend }: { readonly trend: boolean }): ReactElement {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-3 w-20" />
      {trend ? <Skeleton className="h-6 w-full" /> : null}
    </div>
  );
}

/**
 * A dashboard's figure on a small card: its label, its value in large tabular figures, its change with an arrow, a
 * sign and a colour, and a sparkline of its recent values.
 *
 * @use For a KPI at the top of a dashboard or a page. For a figure inside a table, use the number components; for a
 * chart with axes, parallax's Chart.
 * @see Card, Sparkline, Money, Pct, Num
 *
 * @example
 * ```tsx
 * import { Money, StatCard } from "@basis/ui";
 *
 * <StatCard
 *   label="NAV"
 *   value={<Money value={1_284_500_000} abbreviate="M" />}
 *   change={{ value: 0.021, label: "vs yesterday" }}
 *   trend={[1240, 1251, 1248, 1262, 1270, 1284.5]}
 *   trendLabel="NAV over the last six days, in millions"
 *   footnote="As of the 4:00 p.m. close"
 * />;
 * ```
 */
function StatCard({
  label,
  value,
  change,
  trend,
  trendLabel,
  footnote,
  loading = false,
  className,
  ...props
}: StatCardProps): ReactElement {
  return (
    <Card data-slot="stat-card" size="sm" className={cn("min-w-48", className)} {...props}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {loading ? null : (
          <p data-slot="stat-card-value" className="text-2xl font-semibold">
            {value}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {loading ? <Loading trend={trend !== undefined} /> : null}
          {!loading && change !== undefined ? <Change change={change} /> : null}
          {!loading && trend !== undefined ? (
            <Sparkline
              values={trend}
              rising={change?.rising ?? "gain"}
              label={trendLabel ?? label}
              trend
              area
              className="h-8 w-full"
            />
          ) : null}
          {footnote === undefined ? null : (
            <p className="text-xs text-muted-foreground">{footnote}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { StatCard };
export type { StatCardProps, StatChange };
