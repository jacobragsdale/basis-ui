/* `<Grid>`: a data grid and pivot table drawn on a Canvas 2D surface, for desktops without a GPU.
 *
 * The grid opens a view of a dataset with `useView`, takes the view's frames outside React, and draws only the visible
 * rows and columns; when a frame arrives for rows already on screen, only the cells whose text changed are redrawn,
 * which keeps both the CPU and a remote-display protocol such as Citrix's as idle as possible. A scroll asks the view's
 * handle for rows and renders nothing in React.
 *
 * Every change the user makes, a sort, a width, a filter, an expanded group, is a new layout, which the grid hands to
 * `onLayoutChange`. The text in each cell is the engine's, made by the formatter the Excel export uses. Numbers too
 * wide for their cell show `###`, as Excel does, rather than losing digits; the full text shows on hover. Copying puts
 * tab-separated text with every digit on the clipboard, which pastes into Excel as cells. Rows can be chosen, by
 * checkbox or by focus, and the app hears their keys (row-selection.ts). */

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode, Ref, RefObject } from "react";

import type { ExportFormat } from "#engine/messages.ts";
import type { Layout, LayoutInput } from "#layout/layout.ts";
import { Maximizable } from "#react/maximize-parts.tsx";
import type { MaximizeFrame } from "#react/maximize-parts.tsx";
import type { Dataset } from "#react/use-dataset.ts";
import { useParallaxTheme } from "#react/use-theme.ts";
import { useView } from "#react/use-view.ts";
import type { View } from "#react/use-view.ts";

import { GridController } from "./controller.ts";
import { isPivotLayout } from "./edit.ts";
import { readFields } from "./fields.ts";
import type { SourceField } from "./fields.ts";
import { GridBody } from "./grid-body.tsx";
import type { MeasureMenuProps } from "./grid-menu.tsx";
import { GroupPanel } from "./group-panel.tsx";
import type { GridSnapshot } from "./snapshot.ts";
import { StatusBar } from "./status-bar.tsx";
import { allParts } from "./parts.ts";
import type { ToolbarParts } from "./parts.ts";
import { GridToolbar } from "./toolbar.tsx";
import type { DrillRequest, GridInputs } from "./types.ts";
import { useHandles } from "./use-grid-handles.ts";
import type { GridHandle } from "./use-grid-handles.ts";
import { useGridLayout } from "./use-grid-layout.ts";

/** Choosing rows: by checkbox, any number (`true`), or the focused cell's row alone (`"single"`), each named by its
 * value in the `rowKey` column. */
type GridRowSelection =
  | {
      readonly selectable?: false | undefined;
      readonly rowKey?: undefined;
      readonly selected?: undefined;
      readonly onSelectionChange?: undefined;
    }
  | {
      /** Chooses rows: by checkbox, any number (`true`), or the focused cell's row alone (`"single"`). */
      readonly selectable: true | "single";
      /** The column whose value names a row, such as a trade id or a CUSIP: one of the view's columns, with a
       * different value on every row. A row's key is the column's text as a copy writes it, every digit of a number. */
      readonly rowKey: string;
      /** The keys of the rows chosen, when the app holds them; without it, the grid keeps the choice itself. */
      readonly selected?: readonly string[] | undefined;
      /** Takes the keys of the rows chosen, in the order they were chosen, whenever the user changes them. */
      readonly onSelectionChange?: ((keys: readonly string[]) => void) | undefined;
    };

interface GridBaseProps {
  /** The dataset to show, from `useDataset`. */
  readonly dataset: Dataset;
  /** The view: grouping, sorting, filters, formats and widths. The dataset is `dataset`'s. Left out, the grid shows
   * every column in the table's order, each by its API's display format. */
  readonly layout?: LayoutInput | undefined;
  /** Takes every change the user makes. Without it, the grid keeps the changes itself until `layout` changes. */
  readonly onLayoutChange?: ((layout: Layout) => void) | undefined;
  /** The toolbar above the grid: true shows all of it, false hides it, and an object turns parts off, such as
   * `{ export: false }` for a small tile. */
  readonly toolbar?: boolean | Partial<ToolbarParts> | undefined;
  /** `fill` takes the height its container gives; `auto` sizes the grid to its rows, up to `maxHeight`. */
  readonly height?: "fill" | "auto" | undefined;
  /** The tallest an `auto` grid's rows grow, in CSS pixels, before they scroll. */
  readonly maxHeight?: number | undefined;
  /** Takes a double click on a pivot's value, which asks for the rows behind its group. */
  readonly onDrill?: ((request: DrillRequest) => void) | undefined;
  /** What screen readers call the grid; the dataset's name by default. */
  readonly label?: string | undefined;
  /** The date the data is for, the business date, as `YYYY-MM-DD`, such as `"2026-11-06"`. The status bar shows
   * `as of 2026-11-06`, with no age, and About this data keeps the time the source was read. Without it, the bar shows
   * the time the source was read and how long ago, when `useDataset`'s `sourceAsOfMicros` gives one, and no "as of"
   * otherwise: never the time the browser loaded the table. A string that is not a calendar date shows an `ERROR` line
   * there, with the fix, in place of the date. */
  readonly asOf?: string | undefined;
  /** A pivot measure header's menu, which the pivot gives the grid. Without it, a measure's header has no menu. */
  readonly measureMenu?: ((props: MeasureMenuProps) => ReactNode) | undefined;
  /** Takes the dataset's columns when the view opens, and again whenever they change, as the pivot's field list
   * reads them. */
  readonly onFieldsChange?: ((fields: readonly SourceField[]) => void) | undefined;
  /** The grid's handle: `drawStats()`, `export(format)` as `xlsx` or `csv`, and `distinctValues(column, search)`. */
  readonly ref?: Ref<GridHandle> | undefined;
}

type GridProps = GridBaseProps & GridRowSelection;

const defaultMaxHeight = 480;

/** What the controller takes of the row selection props. */
function rowSelectionOf(props: GridRowSelection): GridInputs["rowSelection"] {
  if (props.selectable !== true && props.selectable !== "single") {
    return null;
  }
  return {
    key: props.rowKey,
    mode: props.selectable === "single" ? "single" : "multiple",
    onChange: props.onSelectionChange,
    selected: props.selected,
  };
}

/** The layout of a grid given none: every column, in the table's order. One value, so it never reads as a change. */
const defaultLayout: LayoutInput = {};

/** The toolbar's parts for a layout: a pivot's columns are its measures, and its grand total is a row of its own. */
function partsOf(toolbar: GridProps["toolbar"], layout: Layout | null): ToolbarParts | null {
  if (toolbar === false || layout === null) {
    return null;
  }
  const parts = toolbar === true || toolbar === undefined ? allParts : { ...allParts, ...toolbar };
  return isPivotLayout(layout) ? { ...parts, columns: false, totals: false } : parts;
}

/** A dataset the view does not open on yet: the grid opens its view once it knows the rows it shows first. */
function held(dataset: Dataset): Dataset {
  return { ...dataset, status: "idle" };
}

/** The grid's state: its controller, what React shows of it, its view, and the dataset's columns. */
interface GridState {
  readonly controller: GridController;
  readonly snapshot: GridSnapshot;
  readonly view: View;
  readonly fields: readonly SourceField[];
  readonly change: (layout: Layout) => void;
}

/** The dataset's columns, from the schema the view opened with, which `onFieldsChange` hears of when they change. */
function useFields(
  schema: Uint8Array | null,
  onFieldsChange: GridProps["onFieldsChange"],
): readonly SourceField[] {
  const fields = useMemo(() => readFields(schema ?? new Uint8Array()), [schema]);
  useEffect(() => {
    onFieldsChange?.(fields);
  }, [fields, onFieldsChange]);
  return fields;
}

/** Opens the grid's view on the controller, which takes its frames, and keeps the controller's inputs current. */
function useGrid(props: GridProps): GridState {
  const { dataset, height = "fill", maxHeight = defaultMaxHeight, onFieldsChange } = props;
  const [layout, change] = useGridLayout(props.layout ?? defaultLayout, props.onLayoutChange);
  // oxlint-disable-next-line react/hook-use-state -- one controller for the grid's life, made once; nothing sets it.
  const [controller] = useState(() => new GridController());
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const { opening } = snapshot;
  const view = useView(opening === null ? held(dataset) : dataset, layout, {
    onFrame: controller.receiveFrame,
    ...(opening === null ? {} : { viewport: opening }),
  });
  const fields = useFields(view.opened?.tableSchema ?? null, onFieldsChange);
  useEffect(() => {
    controller.setHandle(view.handle);
  }, [controller, view.handle]);
  useEffect(() => {
    const measureMenus = props.measureMenu !== undefined;
    const drill = props.onDrill ?? null;
    controller.setInputs({
      change,
      drill,
      fields,
      layout: view.layout,
      maxHeight: height === "auto" ? maxHeight : null,
      measureMenus,
      rowSelection: rowSelectionOf(props),
    });
  });
  return { change, controller, fields, snapshot, view };
}

/** The toolbar and the group panel above the grid, as its toolbar setting and its layout allow. */
function Chrome({
  state,
  toolbar,
  onExport,
  refs,
}: {
  readonly state: GridState;
  readonly toolbar: GridProps["toolbar"];
  readonly onExport: (format: ExportFormat) => void;
  readonly refs: {
    readonly search: RefObject<HTMLInputElement | null>;
    readonly groupPanel: RefObject<HTMLElement | null>;
  };
}): ReactNode {
  const { view, fields, change, snapshot } = state;
  const { layout } = view;
  const parts = partsOf(toolbar, layout);
  if (parts === null || layout === null) {
    return null;
  }
  return (
    <>
      <GridToolbar
        layout={layout}
        fields={fields}
        parts={parts}
        onChange={change}
        onExport={onExport}
        searchRef={refs.search}
      />
      {parts.group && !isPivotLayout(layout) ? (
        <GroupPanel
          layout={layout}
          dropping={snapshot.overPanel}
          onChange={change}
          panelRef={refs.groupPanel}
        />
      ) : null}
    </>
  );
}

/** The grid inside its maximizing frame: `root` is its element, which `maximizing` makes fill the window. */
type GridFrameProps = GridProps & MaximizeFrame;

/** The grid's element, its chrome, its canvas and its status bar. */
function GridFrame(props: GridFrameProps): ReactNode {
  const { dataset, ref, toolbar, height = "fill", label, measureMenu, root, maximizing } = props;
  const state = useGrid(props);
  const { controller, snapshot, view, fields, change } = state;
  const search = useRef<HTMLInputElement>(null);
  const groupPanel = useRef<HTMLElement>(null);
  const onExport = useHandles(state, { ref, searchBox: search });
  const { attributes } = useParallaxTheme();
  const id = useId();
  const error =
    snapshot.problem ??
    (view.layout === null && view.error !== null ? `Invalid layout: ${view.error}` : view.error);
  return (
    <div
      {...attributes}
      {...maximizing.props}
      ref={root}
      data-slot="grid"
      data-height={height}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card text-sm text-card-foreground data-maximized:fixed data-maximized:inset-4 data-maximized:z-50 data-maximized:h-auto data-maximized:shadow-md data-[height=auto]:h-auto"
    >
      <Chrome state={state} toolbar={toolbar} onExport={onExport} refs={{ groupPanel, search }} />
      <GridBody
        id={id}
        controller={controller}
        snapshot={snapshot}
        label={label ?? dataset.name}
        error={error}
        layout={view.layout}
        fields={fields}
        handle={view.handle}
        onChange={change}
        measureMenu={measureMenu}
        groupPanel={groupPanel}
      />
      <StatusBar
        dataset={dataset}
        viewRows={snapshot.totalRows}
        sourceAsOf={snapshot.sourceAsOf}
        asOf={props.asOf}
        status={view.table}
        message={snapshot.message}
        selectedRows={snapshot.selectedRows}
        reading={snapshot.reading}
      />
    </div>
  );
}

/** A data grid and pivot table on a canvas, which can fill the window: a grid of `height` `auto` fills it too.
 * @use For many rows the user groups, filters, pivots and exports. For a few hundred with links, use DataTable.
 * @see ParallaxProvider, useDataset, Pivot, Chart, LayoutInput, encodeLayout, DataTable */
function Grid(props: GridProps): ReactNode {
  return (
    <Maximizable label={props.label ?? props.dataset.name}>
      {({ root, maximizing }) => (
        <GridFrame
          {...props}
          height={maximizing.state.maximized ? "fill" : props.height}
          root={root}
          maximizing={maximizing}
        />
      )}
    </Maximizable>
  );
}

export { Grid };
export type { GridProps, GridState };
