/* `<Pivot>`: a pivot table with its settings beside it, as Excel's PivotTable and its field list. The settings edit
 * the same layout the grid shows, so `onLayoutChange` takes every change, whether the user moves a field, sorts,
 * resizes or opens a group. Double-clicking a value opens the rows behind it in a grid below, until the pivot's
 * groups or filters change. The table is `<Grid>`, drawn on its canvas; the settings are `@basis/ui`'s components. */

import { Button, PanelLeftIcon } from "@basis/ui";
import { useId, useImperativeHandle, useRef, useState } from "react";
import type { ReactNode, Ref, RefObject } from "react";

import type { ExportFormat } from "#engine/messages.ts";
import type { DistinctValues } from "#engine/view-types.ts";
import type { SourceField } from "#grid/fields.ts";
import { Grid } from "#grid/grid.tsx";
import type { GridProps } from "#grid/grid.tsx";
import type { DrawStats } from "#grid/paint/stats.ts";
import type { GridHandle } from "#grid/use-grid-handles.ts";
import { useGridLayout } from "#grid/use-grid-layout.ts";
import type { ValueSource } from "#grid/value-picker.tsx";
import { checkLayout } from "#layout/layout.ts";
import type { Layout, LayoutInput } from "#layout/layout.ts";
import type { Dataset } from "#react/use-dataset.ts";

import { DrillRows } from "./drill-rows.tsx";
import { HeaderMeasureMenu } from "./measure-menu.tsx";
import { PivotPanel } from "./pivot-panel.tsx";
import { useDrill } from "./use-drill.ts";

interface PivotProps {
  /** The dataset to pivot, from `useDataset`. */
  readonly dataset: Dataset;
  /** The pivot: its row and column groups, values, filters, sorts, formats and widths. */
  readonly layout: LayoutInput;
  /** Takes every change the user makes. Without it, the pivot keeps the changes itself until `layout` changes. */
  readonly onLayoutChange?: ((layout: Layout) => void) | undefined;
  /** The table's toolbar, as `<Grid>` takes it. */
  readonly toolbar?: GridProps["toolbar"];
  /** Whether the settings start open; they do by default. */
  readonly defaultSettingsOpen?: boolean | undefined;
  /** What screen readers call the table; the dataset's name by default. */
  readonly label?: string | undefined;
  /** The table's grid: its drawing counters, export, and a column's values. */
  readonly ref?: Ref<GridHandle> | undefined;
}

/** The grid's handle, once it is drawn. */
function handleOf(grid: RefObject<GridHandle | null>): GridHandle {
  if (grid.current === null) {
    throw new Error("The pivot's grid is not drawn yet.");
  }
  return grid.current;
}

/** The pivot's ref, which is its grid's. */
function useHandle(ref: PivotProps["ref"], grid: RefObject<GridHandle | null>): void {
  useImperativeHandle(ref, () => ({
    distinctValues: async (
      column: string,
      search: string,
      limit: number,
    ): Promise<DistinctValues> => handleOf(grid).distinctValues(column, search, limit),
    drawStats: (): DrawStats => handleOf(grid).drawStats(),
    export: (format: ExportFormat): void => {
      handleOf(grid).export(format);
    },
  }));
}

interface SettingsProps {
  readonly layout: Layout | null;
  readonly fields: readonly SourceField[];
  readonly source: ValueSource;
  readonly onChange: (layout: Layout) => void;
  readonly defaultOpen: boolean;
}

/** The settings' side: the button that shows or hides them, and the panel. */
function Settings({ layout, fields, source, onChange, defaultOpen }: SettingsProps): ReactNode {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <aside
      aria-label="Pivot settings"
      data-open={open}
      className="flex w-75 shrink-0 flex-col overflow-hidden rounded-xl border bg-card text-sm text-card-foreground data-[open=false]:w-auto"
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        {open ? <h2 className="flex-1 text-sm font-medium">Fields</h2> : null}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={open ? "Hide settings" : "Show settings"}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            setOpen(!open);
          }}
        >
          <PanelLeftIcon />
        </Button>
      </div>
      {open && layout !== null ? (
        <PivotPanel id={id} layout={layout} fields={fields} source={source} onChange={onChange} />
      ) : null}
    </aside>
  );
}

/** A pivot table and its settings. */
function Pivot(props: PivotProps): ReactNode {
  const { dataset, toolbar, label, ref, defaultSettingsOpen = true } = props;
  const [shown, change] = useGridLayout(props.layout, props.onLayoutChange);
  const checked = checkLayout(shown);
  const [fields, setFields] = useState<readonly SourceField[]>([]);
  const { drill, onChange, onDrill, setDrill } = useDrill(
    checked.ok ? checked.layout : null,
    change,
  );
  const grid = useRef<GridHandle>(null);
  useHandle(ref, grid);
  const source: ValueSource = async (column, search, limit) =>
    handleOf(grid).distinctValues(column, search, limit);
  return (
    <div data-slot="pivot" className="flex h-full min-h-0 gap-3">
      <Settings
        layout={checked.ok ? checked.layout : null}
        fields={fields}
        source={source}
        onChange={onChange}
        defaultOpen={defaultSettingsOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="min-h-0 flex-1">
          <Grid
            ref={grid}
            dataset={dataset}
            layout={shown}
            onLayoutChange={onChange}
            toolbar={toolbar}
            label={label}
            onDrill={onDrill}
            onFieldsChange={setFields}
            measureMenu={HeaderMeasureMenu}
          />
        </div>
        {drill === null ? null : (
          <DrillRows
            dataset={dataset}
            drill={drill}
            onChange={setDrill}
            onClose={() => {
              setDrill(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

export { Pivot };
export type { PivotProps };
