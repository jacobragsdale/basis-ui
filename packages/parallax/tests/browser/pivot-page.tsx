/* A page that shows `<Pivot>` over six positions, for the pivot's browser tests: the pivot, sized so its settings and
 * its rows fit, and the layouts it handed back. The positions have a blank sector, for the value pickers' (blank). */

import { Float64, Int32, Table, Utf8, tableToIPC, vectorFromArray } from "apache-arrow";
import { useState } from "react";
import type { ReactNode } from "react";

import type { Layout, LayoutInput } from "#layout/layout.ts";
import { Pivot } from "#pivot/pivot.tsx";
import { useDataset } from "#react/use-dataset.ts";

// Six positions over two funds and two desks; one has no sector.
import holdings from "./holdings.json" with { type: "json" };

/** The holdings' Arrow IPC stream, as an API sends it. */
function holdingsBytes(): ArrayBuffer {
  const table = new Table({
    desk: vectorFromArray(holdings.desk, new Utf8()),
    fund: vectorFromArray(holdings.fund, new Utf8()),
    market_value: vectorFromArray(holdings.market_value, new Float64()),
    quantity: vectorFromArray(holdings.quantity, new Int32()),
    sector: vectorFromArray(holdings.sector, new Utf8()),
  });
  return new Uint8Array(tableToIPC(table, "stream")).buffer;
}

/** The pivot, holding its layout as an app does, and keeping each layout it hands back. */
function PivotPage({
  first,
  changes,
}: {
  readonly first: LayoutInput;
  readonly changes: Layout[];
}): ReactNode {
  const dataset = useDataset("holdings", holdingsBytes);
  const [layout, setLayout] = useState(first);
  return (
    <div className="h-200 w-full">
      <Pivot
        dataset={dataset}
        layout={layout}
        onLayoutChange={(next) => {
          changes.push(next);
          setLayout(next);
        }}
      />
    </div>
  );
}

export { PivotPage };
