/* A page that shows parallax's state as text, for the hooks' browser tests: each dataset's status, and a pivot's
 * status, error and rows. */

import { useEffect } from "react";
import type { ReactNode } from "react";

import type { ViewHandle } from "#engine/view.ts";
import type { FrameData } from "#frame/frame.ts";
import type { LayoutInput } from "#layout/layout.ts";
import { useDataset } from "#react/use-dataset.ts";
import type { DatasetSource } from "#react/use-dataset.ts";
import { useView } from "#react/use-view.ts";

import { byFund, positionsBytes } from "./data.ts";

/** A pivot frame's rows as "label: sum". */
function rowsOf(frame: FrameData | null): readonly string[] {
  if (frame === null) {
    return [];
  }
  return Array.from(
    { length: frame.rowCount },
    (_entry, row) => `${frame.tree?.label(row) ?? ""}: ${frame.columns[0]?.text(row) ?? ""}`,
  );
}

interface PivotProps {
  /** The positions' source: their bytes, fetched afresh, by default. */
  readonly positions?: DatasetSource;
  /** A second dataset, loaded beside the positions when given. */
  readonly other?: DatasetSource | null;
  readonly layout?: LayoutInput;
  /** Every view handle the pivot has had, so a test can tell an update from a reopening. */
  readonly handles?: Set<ViewHandle>;
}

function Pivot({
  positions = positionsBytes,
  other = null,
  layout = byFund,
  handles,
}: PivotProps): ReactNode {
  const loaded = useDataset("positions", positions);
  const view = useView(loaded, layout);
  const second = useDataset("other", other);
  useEffect(() => {
    if (view.handle !== null) {
      handles?.add(view.handle);
    }
  }, [handles, view.handle]);
  return (
    <section>
      <output aria-label="positions">{loaded.status}</output>
      <output aria-label="view">{view.status}</output>
      <output aria-label="table rows">{view.table === null ? "" : String(view.table.rows)}</output>
      <output aria-label="other">{second.status}</output>
      <p aria-label="other error">{second.error}</p>
      <p aria-label="view error">{view.error}</p>
      <ol aria-label="rows">
        {rowsOf(view.frame).map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ol>
    </section>
  );
}

export { Pivot };
