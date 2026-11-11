/* `<Pivot>`: a pivot table with its settings beside it, as Excel's PivotTable and its field list. The settings edit
 * the same layout the grid shows, so `onLayoutChange` takes every change, whether the user moves a field, sorts,
 * resizes or opens a group. Double-clicking a value opens the rows behind it in a grid below, until the pivot's
 * groups or filters change. The table is `<Grid>`, drawn on its canvas; the settings are `@basis/ui`'s components.
 * Maximize, in the table's toolbar, makes the whole pivot fill the window, settings and rows behind a value with it. */

import { Button, PanelLeftIcon } from "@basis/ui";
import { useId, useImperativeHandle, useRef, useState } from "react";
import type { ReactNode, Ref, RefObject } from "react";

import type { ExportFormat } from "#engine/messages.ts";
import type { DistinctValues } from "#engine/view-types.ts";
import type { GridSelection } from "#grid/actions.ts";
import type { SourceField } from "#grid/fields.ts";
import { Grid } from "#grid/grid.tsx";
import type { GridProps } from "#grid/grid.tsx";
import type { DrawStats } from "#grid/paint/stats.ts";
import type { GridHandle } from "#grid/use-grid-handles.ts";
import { useGridLayout } from "#grid/use-grid-layout.ts";
import type { ValueSource } from "#grid/value-picker.tsx";
import { checkLayout } from "#layout/layout.ts";
import type { Layout } from "#layout/layout.ts";
import { Maximizable } from "#react/maximize-parts.tsx";
import type { MaximizeFrame } from "#react/maximize-parts.tsx";
import type { AnyRow, LayoutFor } from "#layout/typed.ts";
import type { Dataset } from "#react/use-dataset.ts";

import { DrillRows } from "./drill-rows.tsx";
import { HeaderMeasureMenu } from "./measure-menu.tsx";
import { PivotPanel } from "./pivot-panel.tsx";
import { useDrill } from "./use-drill.ts";

interface PivotProps<TRow extends AnyRow = AnyRow> {
  /** The dataset to pivot, from `useDataset`. */
  readonly dataset: Dataset<TRow>;
  /** The pivot: its row and column groups, values, filters, sorts, formats and widths, naming only the columns of a
   * dataset of rows of a known type. */
  readonly layout: LayoutFor<TRow>;
  /** Takes every change the user makes. Without it, the pivot keeps the changes itself until `layout` changes. */
  readonly onLayoutChange?: ((layout: Layout) => void) | undefined;
  /** The table's toolbar, as `<Grid>` takes it. */
  readonly toolbar?: GridProps["toolbar"];
  /** Whether the settings start open; they do by default. */
  readonly defaultSettingsOpen?: boolean | undefined;
  /** What screen readers call the table; the dataset's name by default. */
  readonly label?: string | undefined;
  /** The date the data is for, as `YYYY-MM-DD`, which the table's status bar, and that of the rows behind a value,
   * show as `as of 2026-11-06`; as `<Grid>` takes it. */
  readonly asOf?: string | undefined;
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
    copy: async (withHeaders?: boolean): Promise<void> => handleOf(grid).copy(withHeaders),
    getSelection: (): GridSelection | null => handleOf(grid).getSelection(),
    scrollTo: (row: number, column?: string): void => {
      handleOf(grid).scrollTo(row, column);
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

/** The rows behind the value double-clicked, below the table, until they are closed. */
function Drilled({
  dataset,
  asOf,
  drill,
  setDrill,
}: Pick<ReturnType<typeof useDrill>, "drill" | "setDrill"> & {
  readonly dataset: Dataset;
  readonly asOf: string | undefined;
}): ReactNode {
  return drill === null ? null : (
    <DrillRows
      dataset={dataset}
      asOf={asOf}
      drill={drill}
      onChange={setDrill}
      onClose={() => {
        setDrill(null);
      }}
    />
  );
}

/** The pivot inside its maximizing frame: `root` is its element, which `maximizing` makes fill the window. */
type PivotFrameProps = PivotProps & MaximizeFrame;

/** The pivot's element: its settings, its table, and the rows behind a value. */
function PivotFrame(props: PivotFrameProps): ReactNode {
  const { dataset, toolbar, label, ref, defaultSettingsOpen = true, root, maximizing } = props;
  const [shown, change] = useGridLayout(props.layout, props.onLayoutChange);
  const checked = checkLayout(shown);
  const valid = checked.ok ? checked.layout : null;
  const [fields, setFields] = useState<readonly SourceField[]>([]);
  const { drill, onChange, onDrill, setDrill } = useDrill(valid, change);
  const grid = useRef<GridHandle>(null);
  useHandle(ref, grid);
  const source: ValueSource = async (...args) => handleOf(grid).distinctValues(...args);
  return (
    <div
      {...maximizing.props}
      ref={root}
      data-slot="pivot"
      className="flex h-full min-h-0 gap-3 data-maximized:fixed data-maximized:inset-4 data-maximized:z-50 data-maximized:h-auto data-maximized:rounded-xl data-maximized:border data-maximized:bg-background data-maximized:p-3 data-maximized:shadow-md"
    >
      <Settings
        layout={valid}
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
            asOf={props.asOf}
            onDrill={onDrill}
            onFieldsChange={setFields}
            measureMenu={HeaderMeasureMenu}
          />
        </div>
        <Drilled dataset={dataset} asOf={props.asOf} drill={drill} setDrill={setDrill} />
      </div>
    </div>
  );
}

/** A pivot table and its settings, which can fill the window together.
 *
 * @use For a pivot table the user rearranges, with its field list beside it, as Excel's PivotTable. For a pivot the app
 * fixes, give a Grid a layout with `group_by`, `split_by` and `measures`.
 * @see ParallaxProvider, useDataset, Grid, drillLayout, LayoutInput, encodeLayout, decodeLayout
 *
 * @example
 * ```tsx
 * import { Pivot, useDataset } from "@basis/parallax";
 * import type { LayoutInput } from "@basis/parallax";
 * import { useState } from "react";
 * import type { ReactNode } from "react";
 *
 * // The generated client's call for an Arrow route, as in `(await listPositions()).data.arrayBuffer()`.
 * declare const positionsBytes: () => Promise<ArrayBuffer>;
 *
 * export function Exposure(): ReactNode {
 *   const positions = useDataset("positions", positionsBytes, { primaryKey: "position_id" });
 *   const [layout, setLayout] = useState<LayoutInput>({
 *     group_by: ["fund"],
 *     split_by: ["asset_class"],
 *     measures: [{ aggregate: "sum", column: "market_value_usd" }],
 *   });
 *   return <Pivot dataset={positions} layout={layout} onLayoutChange={setLayout} />;
 * }
 * ```
 */
function Pivot<TRow extends AnyRow = AnyRow>(props: PivotProps<TRow>): ReactNode;
function Pivot(props: PivotProps): ReactNode {
  return (
    <Maximizable label={props.label ?? props.dataset.name}>
      {({ root, maximizing }) => <PivotFrame {...props} root={root} maximizing={maximizing} />}
    </Maximizable>
  );
}

export { Pivot };
export type { PivotProps };
