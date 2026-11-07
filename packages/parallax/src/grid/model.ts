/* What a grid knows at any moment, outside React: its layout and the dataset's columns, the latest frame, its tokens,
 * its size and scroll, the widths fitted to its values, and what follows from them: where its columns and rows sit,
 * which columns have a menu, and the rows and columns in view. */

import type { Viewport } from "#engine/view-types.ts";
import type { FrameData } from "#frame/frame.ts";
import { treeWidthKey } from "#layout/layout.ts";
import type { Layout } from "#layout/layout.ts";
import type { Theme } from "#theme/read.ts";

import { sortMarkOf } from "./changes.ts";
import { isPivotLayout, searchColumns, shownColumns } from "./edit.ts";
import type { SourceField } from "./fields.ts";
import { isFiltered } from "./filters.ts";
import { ColumnFitter, widthToFit } from "./fit.ts";
import type { Ruler } from "./fit.ts";
import {
  defaultTreeWidth,
  defaultWidth,
  flatGeometry,
  groupedGeometry,
  minWidth,
  rowGeometry,
} from "./geometry.ts";
import type { ColumnGeometry, RowGeometry } from "./geometry.ts";
import type { Surface } from "./hit.ts";
import { chevronPath, funnelPath } from "./paint/icons.ts";
import { metricsOf } from "./paint/metrics.ts";
import type { Metrics } from "./paint/metrics.ts";
import type { HeaderLook, Searched, SortMark } from "./paint/scene.ts";
import type { Extent } from "./selection.ts";
import type { Interaction } from "./types.ts";

/** The visible area: its size and how far it is scrolled. */
interface Area {
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly width: number;
  readonly height: number;
}

/** A width being dragged, before it is committed to the layout. */
interface LiveWidth {
  readonly key: string;
  readonly width: number;
}

const noSearch: Searched = { labelsSearched: false, search: "", searched: new Set() };

/** A grid's state, and the geometry that follows from it. */
class GridModel {
  public readonly fitter = new ColumnFitter();
  public layout: Layout | null = null;
  public fields: readonly SourceField[] = [];
  public frame: FrameData | null = null;
  public theme: Theme | null = null;
  public area: Area = { height: 0, scrollLeft: 0, scrollTop: 0, width: 0 };
  public liveWidth: LiveWidth | null = null;
  /** Whether a pivot's measure headers open a menu, which the pivot gives the grid. */
  public measureMenus = false;
  public readonly interaction: Interaction = {
    drag: null,
    hoverHeader: null,
    hoverRow: null,
    menu: null,
    overPanel: false,
    pointerAt: null,
    selection: null,
  };
  #geometry: { readonly key: unknown[]; readonly value: ColumnGeometry } | null = null;
  #metrics: { readonly theme: Theme; readonly value: Metrics } | null = null;

  /** The sizes the tokens give; null until they are read. */
  public get metrics(): Metrics | null {
    const { theme } = this;
    if (theme === null) {
      return null;
    }
    if (this.#metrics?.theme !== theme) {
      this.#metrics = { theme, value: metricsOf(theme) };
    }
    return this.#metrics.value;
  }

  /** Whether the layout is a pivot of measures. */
  public get pivot(): boolean {
    return this.layout !== null && isPivotLayout(this.layout);
  }

  /** The view's rows, 0 before the first frame. */
  public get totalRows(): number {
    return this.frame?.totalRows ?? 0;
  }

  /** Whether the frame has a totals row, drawn along the bottom. */
  public get footer(): boolean {
    return (this.frame?.totals ?? null) !== null;
  }

  /** Where the columns sit, from the layout's widths, a width being dragged and the widths fitted. */
  public get geometry(): ColumnGeometry {
    const key = [
      this.layout,
      this.fields,
      this.fitter.fitted,
      this.liveWidth,
      this.frame?.totalColumns ?? 0,
    ];
    const known = this.#geometry;
    if (known !== null && key.every((part, index) => part === known.key[index])) {
      return known.value;
    }
    const value = this.#columns();
    this.#geometry = { key, value };
    return value;
  }

  /** Where the rows sit, under the header, the totals row counted as one more. */
  public rows(metrics: Metrics): RowGeometry {
    return rowGeometry(this.totalRows + (this.footer ? 1 : 0), metrics.rowPx, metrics.headerPx);
  }

  /** The view's extent, for moving the selection. */
  public get extent(): Extent {
    const { geometry } = this;
    return { columns: geometry.count, rows: this.totalRows, tree: geometry.treePx > 0 };
  }

  /** The rows and data columns in view. Before the first frame, when the column count is unknown, it covers the
   * width at default widths. */
  public visible(metrics: Metrics): Viewport {
    const { geometry } = this;
    const { scrollLeft, width, height } = this.area;
    const firstRow = this.rows(metrics).firstRow(this.area.scrollTop, height);
    const rowCount = Math.ceil(height / metrics.rowPx) + 1;
    if (geometry.count === 0) {
      return {
        columnCount: Math.ceil(width / defaultWidth) + 1,
        firstColumn: 0,
        firstRow,
        rowCount,
      };
    }
    // Pinned columns show whatever the scroll, so the window always starts with them.
    const left = geometry.pinned > 0 ? 0 : geometry.indexAt(geometry.frozenPx + scrollLeft);
    const right = geometry.indexAt(scrollLeft + width);
    return { columnCount: right - left + 1, firstColumn: left, firstRow, rowCount };
  }

  /** The source column a data column's menu edits, or null where there is no menu: a pivot's columns are measures. */
  public menuColumn(column: number): string | null {
    if (this.layout === null || column < 0 || column >= this.geometry.count || this.pivot) {
      return null;
    }
    return this.geometry.widthKey(column);
  }

  /** The measure a pivot's data column shows, whose menu its header opens, if the pivot gave the grid one. */
  public menuMeasure(column: number): number | null {
    const { layout } = this;
    if (layout === null || !this.pivot || !this.measureMenus || layout.measures.length === 0) {
      return null;
    }
    return column >= 0 && column < this.geometry.count ? column % layout.measures.length : null;
  }

  /** Whether data column `column`'s header opens a menu. */
  public hasMenu(column: number): boolean {
    return this.menuColumn(column) !== null || this.menuMeasure(column) !== null;
  }

  /** How a header with a menu shows its column's state: filtered, pinned, and the mark that opens it. */
  public look(column: number): HeaderLook | null {
    const name = this.menuColumn(column);
    const { layout } = this;
    if (layout === null) {
      return null;
    }
    if (name !== null) {
      return {
        filtered: isFiltered(layout, name),
        mark: funnelPath,
        pinned: layout.pinned.includes(name),
      };
    }
    return this.menuMeasure(column) === null
      ? null
      : { filtered: false, mark: chevronPath, pinned: false };
  }

  /** Column `column`'s sort mark, -1 for the group column. */
  public sortMark(column: number): SortMark | null {
    const name = column >= 0 && !this.pivot ? this.geometry.widthKey(column) : "";
    return sortMarkOf(this.layout, column, name);
  }

  /** The key the width of data column `column`, -1 for the group column, is kept under. */
  public widthKey(column: number): string {
    return column === -1 ? treeWidthKey : this.geometry.widthKey(column);
  }

  /** The width of data column `column`, -1 for the group column. */
  public widthOf(column: number): number {
    return column === -1 ? this.geometry.treePx : this.geometry.width(column);
  }

  /** The search `search` names, the columns it looks in, and whether it looks in the group labels. */
  public searched(search: string): Searched {
    const { layout } = this;
    if (search === "" || layout === null) {
      return noSearch;
    }
    const searched: ReadonlySet<string> = new Set(searchColumns(layout, this.fields));
    return {
      labelsSearched: layout.group_by.some((column) => searched.has(column)),
      search,
      searched,
    };
  }

  /** What hit testing reads, for these sizes. */
  public surface(metrics: Metrics): Surface {
    return {
      footer: this.footer,
      geometry: this.geometry,
      hasMenu: (column) => this.hasMenu(column),
      height: this.area.height,
      metrics,
      rows: this.rows(metrics),
      scrollLeft: this.area.scrollLeft,
      scrollTop: this.area.scrollTop,
      totalRows: this.totalRows,
    };
  }

  /** Fits the newest frame's columns the user has not sized to their header and values. */
  public fit(context: CanvasRenderingContext2D | null, widths: Ruler["widths"]): void {
    const { frame, layout } = this;
    const ruler = this.#ruler(context, widths);
    if (frame !== null && layout !== null && ruler !== null) {
      this.fitter.fit(ruler, frame, layout);
    }
  }

  /** The width that shows data column `column`'s header and loaded values, -1 for the group column. */
  public widthToFit(
    context: CanvasRenderingContext2D | null,
    widths: Ruler["widths"],
    column: number,
  ): number {
    const { frame } = this;
    const ruler = this.#ruler(context, widths);
    const fitted = frame === null || ruler === null ? null : widthToFit(ruler, frame, column);
    return fitted ?? this.widthOf(column);
  }

  /** What fitting columns measures with, once the tokens are read. */
  #ruler(context: CanvasRenderingContext2D | null, widths: Ruler["widths"]): Ruler | null {
    const { theme, metrics } = this;
    return theme === null || metrics === null || context === null
      ? null
      : { context, metrics, theme, widths };
  }

  /** The layout's widths, with the one being dragged. */
  #widths(): Readonly<Record<string, number>> {
    const live = this.liveWidth;
    return { ...this.layout?.column_widths, ...(live === null ? {} : { [live.key]: live.width }) };
  }

  #columns(): ColumnGeometry {
    const { layout } = this;
    const count = this.frame?.totalColumns ?? 0;
    const widths = this.#widths();
    if (layout !== null && isPivotLayout(layout)) {
      // A measure's columns, one under each pivot value, share its fitted width, and a width the user set wins.
      return groupedGeometry(count, layout.measures.length, { ...this.fitter.fitted, ...widths });
    }
    const names =
      layout === null ? this.fields.map((field) => field.name) : shownColumns(layout, this.fields);
    const pinned =
      layout === null ? 0 : layout.pinned.filter((column) => names.includes(column)).length;
    // A detail view keeps its group column at the left, as a pivot does, before its own columns.
    const grouped = layout !== null && layout.detail && layout.group_by.length > 0;
    const treePx = grouped ? Math.max(minWidth, widths[treeWidthKey] ?? defaultTreeWidth) : 0;
    return flatGeometry(count, widths, { fitted: this.fitter.fitted, names, pinned, treePx });
  }
}

export { GridModel };
export type { Area, LiveWidth };
