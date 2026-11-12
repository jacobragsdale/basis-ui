/* DescriptionList: a detail page's facts, such as a bond's terms: each a term and its value, the terms in the muted
 * colour beside or above their values, in one column or several. A value that is a number lines up by place, in
 * tabular figures, as the body's are. */

import { cn } from "cn";
import type { ComponentProps, ReactElement, ReactNode } from "react";

/** One fact: its term, and its value. */
interface DescriptionItem {
  readonly term: ReactNode;
  readonly description: ReactNode;
  /** A stable key, where the term is not text; the term's text unless set. */
  readonly key?: string | undefined;
}

/** The grid's columns for each count, one on a narrow screen. */
const columnClasses = {
  1: "grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-2 xl:grid-cols-3",
} as const;

interface DescriptionListProps extends Omit<ComponentProps<"dl">, "children"> {
  /** The facts, in order. */
  readonly items: readonly DescriptionItem[];
  /** How many columns of facts it lays out in; one unless set, and at most three. */
  readonly columns?: keyof typeof columnClasses | undefined;
  /** Each term beside its value, the default, or above it, for long values or a narrow panel. */
  readonly layout?: "beside" | "above" | undefined;
}

/** A list of facts, each a term and its value.
 *
 * @use For a detail page's facts, such as a bond's coupon, maturity and issuer, or an order's fields once placed. For
 * rows of like things, use Table or DataTable; for a figure with its change, StatCard.
 * @see Table, StatCard, Card, Money, DateTime
 *
 * @example
 * ```tsx
 * import { DescriptionList, Money, Pct } from "@basis/ui";
 *
 * <DescriptionList
 *   columns={2}
 *   items={[
 *     { term: "Coupon", description: <Pct value={0.04125} decimals={3} /> },
 *     { term: "Maturity", description: "2036-05-15" },
 *     { term: "Outstanding", description: <Money value={42_000_000_000} abbreviate="B" /> },
 *     { term: "Day count", description: "30/360" },
 *   ]}
 * />;
 * ```
 */
function DescriptionList({
  items,
  columns = 1,
  layout = "beside",
  className,
  ...props
}: DescriptionListProps): ReactElement {
  return (
    <dl
      data-slot="description-list"
      data-layout={layout}
      className={cn("grid gap-x-8 gap-y-2 text-sm", columnClasses[columns], className)}
      {...props}
    >
      {items.map((item, index) => (
        <div
          key={item.key ?? (typeof item.term === "string" ? item.term : String(index))}
          className={cn(
            "flex min-w-0 gap-x-4 gap-y-0.5 border-b border-edge py-1.5",
            layout === "beside" ? "items-baseline justify-between" : "flex-col",
          )}
        >
          <dt className="shrink-0 text-muted-foreground">{item.term}</dt>
          <dd className={cn("min-w-0 font-medium", layout === "beside" && "text-right")}>
            {item.description}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export { DescriptionList };
export type { DescriptionItem, DescriptionListProps };
