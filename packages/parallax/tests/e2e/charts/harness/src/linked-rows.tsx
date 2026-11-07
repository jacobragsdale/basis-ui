/* A view that a chart narrows, standing in for the Angular demo's grid beside it: its title and how many rows it has,
 * which is what the specs read. The grid family's own React port replaces the grid itself. */

import type { ReactNode } from "react";

import { useView } from "#index.ts";
import type { Dataset, LayoutInput } from "#index.ts";

const count = new Intl.NumberFormat("en-US");

interface LinkedRowsProps {
  /** Which chart narrows it. */
  readonly linked: string;
  readonly data: Dataset;
  readonly layout: LayoutInput;
  readonly title: string;
}

/** The rows a chart narrows, counted. */
function LinkedRows({ linked, data, layout, title }: LinkedRowsProps): ReactNode {
  const view = useView(data, layout, {
    viewport: { columnCount: 10, firstColumn: 0, firstRow: 0, rowCount: 1 },
  });
  const rows = view.frame?.totalRows;
  return (
    <section
      data-linked={linked}
      className="flex h-85 flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm"
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      <p data-slot="linked-rows" className="text-xs text-muted-foreground tabular-nums">
        {rows === undefined ? "loading" : `${count.format(rows)} rows`}
      </p>
    </section>
  );
}

export { LinkedRows };
