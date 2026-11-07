/* A page that shows a grid of a dataset, for the grid's browser tests: the grid, sized so that its rows scroll, and
 * the layout it last handed back. */

import { useState } from "react";
import type { ReactNode, Ref } from "react";

import { Grid } from "#grid/grid.tsx";
import type { GridProps } from "#grid/grid.tsx";
import type { GridHandle } from "#grid/use-grid-handles.ts";
import type { Layout, LayoutInput } from "#layout/layout.ts";
import { useDataset } from "#react/use-dataset.ts";
import type { DatasetSource } from "#react/use-dataset.ts";

import { positionsBytes } from "./data.ts";

/** What the page shows. */
interface GridPageProps {
  readonly source?: DatasetSource;
  readonly layout?: LayoutInput;
  /** Whether the page holds the layout, as an app does, or leaves it to the grid. */
  readonly controlled?: boolean;
  readonly changes?: Layout[];
  readonly gridRef?: Ref<GridHandle>;
  readonly grid?: Partial<GridProps>;
}

const noLayout: LayoutInput = {};
const noProps: Partial<GridProps> = {};

function GridPage({
  source = positionsBytes,
  layout: first = noLayout,
  controlled = true,
  changes,
  gridRef,
  grid = noProps,
}: GridPageProps): ReactNode {
  const positions = useDataset("positions", source);
  const [layout, setLayout] = useState<LayoutInput>(first);
  const onLayoutChange = (next: Layout): void => {
    changes?.push(next);
    setLayout(next);
  };
  return (
    <div className="h-96 w-full max-w-3xl">
      <Grid
        {...grid}
        ref={gridRef}
        dataset={positions}
        layout={layout}
        onLayoutChange={controlled ? onLayoutChange : undefined}
      />
    </div>
  );
}

export { GridPage };
export type { GridPageProps };
