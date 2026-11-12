/* HeatCell: a value's heat behind its text in a table's cell, on the theme's sequential or diverging scale, with the
 * ink that reads best on its step in the theme and mode shown (heat.ts). It fills the cell to its edges, so a column of
 * them reads as a heatmap, and holds its text as the number components draw it, a signed number in the cell's ink
 * with its sign, since the heat already shows its direction and the gain and loss colours would not read on it. */

import { cn } from "cn";
import { useSyncExternalStore } from "react";
import type { ReactElement, ReactNode } from "react";

import { heatToken, heatVersion, shownStep, subscribeHeat } from "./heat.ts";
import type { HeatDomain, HeatToken } from "./heat.ts";

/** Each step's fill, written out so the stylesheet holds every one. */
const fills: Readonly<Record<HeatToken, string>> = {
  "div-1": "bg-div-1",
  "div-2": "bg-div-2",
  "div-3": "bg-div-3",
  "div-4": "bg-div-4",
  "div-5": "bg-div-5",
  "div-6": "bg-div-6",
  "div-7": "bg-div-7",
  "div-8": "bg-div-8",
  "div-9": "bg-div-9",
  "div-10": "bg-div-10",
  "div-11": "bg-div-11",
  "seq-1": "bg-seq-1",
  "seq-2": "bg-seq-2",
  "seq-3": "bg-seq-3",
  "seq-4": "bg-seq-4",
  "seq-5": "bg-seq-5",
  "seq-6": "bg-seq-6",
  "seq-7": "bg-seq-7",
  "seq-8": "bg-seq-8",
  "seq-9": "bg-seq-9",
};

interface HeatCellProps extends HeatDomain {
  /** The value whose heat it shows; `null` shows no heat. */
  readonly value: number | null;
  /** The text, such as `<Pct value={row.change} signed />`. */
  readonly children: ReactNode;
}

/** The step a cell shows and its ink, measured again whenever the theme, mode or density changes: the value's step,
 * or the next toward its end of the scale where that one reads with neither ink. */
function useShownStep(token: HeatToken | undefined): {
  readonly fill: string;
  readonly ink: string;
  readonly token: HeatToken | undefined;
} {
  useSyncExternalStore(subscribeHeat, heatVersion, heatVersion);
  if (token === undefined) {
    return { fill: "", ink: "", token };
  }
  const shown = shownStep(token);
  return {
    fill: fills[shown.token] ?? "",
    ink: shown.ink === "background" ? "text-background" : "text-foreground",
    token: shown.token,
  };
}

/**
 * A value's heat behind its text, filling a table's cell: on the sequential scale from `min` to `max`, or on the
 * diverging scale either side of `mid`, 0 unless set. Give every cell of a column the same domain, such as the column's
 * least and greatest values.
 *
 * @use For a column whose values read best as a heatmap, such as returns by month or spreads by rating. For a value's
 * size beside its text, use CellBar; for a whole matrix, parallax's Chart.
 * @see CellBar, DataTable, Table, Pct
 *
 * @example
 * ```tsx
 * import { HeatCell, Pct } from "@basis/ui";
 *
 * <HeatCell value={-0.012} scale="diverging" min={-0.05} max={0.05}>
 *   <Pct value={-0.012} signed />
 * </HeatCell>;
 * ```
 */
function HeatCell({ value, children, ...domain }: HeatCellProps): ReactElement {
  const shown = useShownStep(
    value === null || Number.isNaN(value) ? undefined : heatToken(value, domain),
  );
  return (
    <div
      data-slot="heat-cell"
      data-heat={shown.token}
      className={cn(
        "-m-2 p-2 text-right tabular-nums **:data-direction:text-inherit",
        shown.fill,
        shown.ink,
      )}
    >
      {children}
    </div>
  );
}

export { HeatCell };
export type { HeatCellProps };
