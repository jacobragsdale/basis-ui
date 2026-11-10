/* The rows behind a pivot's value, below the pivot: a flat grid of them, found, searched and exported from its toolbar.
 * Its filters are what put the rows there, so they show in its title rather than as chips to remove, and its rows are
 * not grouped again. */

import { Button, XIcon } from "@basis/ui";
import type { ReactNode } from "react";

import { Grid } from "#grid/grid.tsx";
import type { ToolbarParts } from "#grid/parts.ts";
import type { Layout } from "#layout/layout.ts";
import type { Dataset } from "#react/use-dataset.ts";

/** The rows open below the pivot: their label, their view, and the pivot's groups and filters they were found by. */
interface Drill {
  readonly label: string;
  readonly layout: Layout;
  readonly source: string;
}

// The pivot's own toolbar maximizes the pivot, these rows with it.
const drillTools: Partial<ToolbarParts> = { chips: false, group: false, maximize: false };

interface DrillRowsProps {
  readonly dataset: Dataset;
  /** The date the data is for, as the pivot takes it. */
  readonly asOf: string | undefined;
  readonly drill: Drill;
  /** Takes the rows' view as the user changes it: a sort, a width, a search. */
  readonly onChange: (drill: Drill) => void;
  readonly onClose: () => void;
}

/** The rows behind a value. */
function DrillRows({ dataset, asOf, drill, onChange, onClose }: DrillRowsProps): ReactNode {
  const title = `Rows behind ${drill.label}`;
  return (
    <section
      aria-label={title}
      data-slot="pivot-drill"
      className="flex h-2/5 min-h-40 flex-col gap-1.5"
    >
      <header className="flex items-center gap-2 px-1 text-sm">
        <h2 className="flex-1 truncate font-medium">{title}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close the rows" onClick={onClose}>
          <XIcon />
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        <Grid
          dataset={dataset}
          layout={drill.layout}
          toolbar={drillTools}
          label={title}
          asOf={asOf}
          onLayoutChange={(layout) => {
            onChange({ ...drill, layout });
          }}
        />
      </div>
    </section>
  );
}

export { DrillRows };
export type { Drill };
