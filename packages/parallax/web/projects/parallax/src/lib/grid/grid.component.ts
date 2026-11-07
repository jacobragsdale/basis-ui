/**
 * `<px-grid>`: a data grid and pivot table drawn on a Canvas 2D surface, for
 * desktops without a GPU.
 *
 * The grid takes one layout and reports every change to it through
 * `layoutChange`, so `[(layout)]` keeps a host's copy current: sorting, column
 * widths, and expanded or collapsed groups all live in the layout. Only the
 * visible rows and columns are drawn, and when a frame arrives for rows already on
 * screen only the cells whose text changed are redrawn, which keeps both the CPU
 * and a remote-display protocol such as Citrix's as idle as possible.
 *
 * The text in each cell is the engine's, made by the formatter the Excel export
 * uses. Numbers too wide for their cell show `###`, as Excel does, rather than
 * losing digits; the full text shows on hover. Copying puts tab-separated text
 * with every digit on the clipboard, which pastes into Excel as cells.
 */

import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild
} from "@angular/core";

import * as z from "zod/mini";

import type { DistinctValues, Viewport } from "../connection";
import { isNegativeText } from "../format";
import { CellFlag } from "../frame";
import type { FrameColumn, FrameData, RowKind, TreeRows } from "../frame";
import { TREE_WIDTH_KEY, checkLayout, measureWidthKey } from "../layout";
import type { Layout, LayoutInput, LayoutScalar } from "../layout";
import { ParallaxClient } from "../client";
import { DENSITY_STEP, defaultTheme, readTheme, sameTheme } from "../theme";
import type { ParallaxTheme, Scheme, Theme } from "../theme";
import { themed } from "../theming";
import { DEFAULT_TREE_WIDTH, DEFAULT_WIDTH, MIN_WIDTH, columnAt, flatGeometry, groupedGeometry, rowGeometry, screenX, scrolledColumns } from "./geometry";
import type { ColumnGeometry } from "./geometry";
import { groupPath, gridSource, withExpanded } from "./grid-source";
import { highlightRanges, isFiltered, searchColumns, shownColumns, withColumnBefore, withGroupedBy } from "./edit";
import { GroupPanelComponent } from "./group-panel.component";
import { ColumnMenuComponent } from "./column-menu.component";
import { PopoverComponent } from "../ui/popover.component";
import { contains, moveFocus, rangeOf, selectAll, toTsv } from "./selection";
import type { CellRange, CellRef, Extent, Selection } from "./selection";
import { StatusBarComponent } from "./status-bar.component";
import { ALL_PARTS, GridToolbarComponent } from "./toolbar.component";
import type { ToolbarParts } from "./toolbar.component";

/** Counters for measuring the grid. */
export interface DrawStats {
  readonly frames: number;
  readonly fullDraws: number;
  readonly cellDraws: number;
  readonly drawMs: number;
  /** For the most recent frames that answered a request, the time from asking for the rows to drawing them, in ms. */
  readonly latencyMs: readonly number[];
  /** When the view last began opening, connecting included, and when its first rows were drawn, by `performance.now()`; null until drawn. */
  readonly firstRows: { readonly openedAtMs: number; readonly drawnAtMs: number } | null;
  /** For the most recent layout changes, such as a sort or a filter, when each was sent and when its answer was drawn, by `performance.now()`. */
  readonly changes: readonly { readonly sentAtMs: number; readonly drawnAtMs: number }[];
}

/** How many recent request-to-draw times the stats keep. */
const LATENCIES = 100;

/** A request for the rows behind one group. */
export interface DrillRequest {
  /** The group's values from the outermost level; empty for the grand total. */
  readonly path: readonly LayoutScalar[];
  /** The pivot values of the cell's column, or null for a row total or a flat column. */
  readonly split: readonly LayoutScalar[] | null;
  /** The group's label as shown. */
  readonly label: string;
}

/** The message a refused export posts from its hidden frame. */
const exportRefusal = z.strictObject({ source: z.literal("parallax-export"), token: z.string(), error: z.string() });

const EXPORT_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** An export's file name, as the server names it: the dataset, made safe, and the time in New York, such as `positions-2026-11-07-1430.xlsx`. */
export function exportFileName(dataset: string, extension: string, at: Date): string {
  const parts = new Map(EXPORT_TIME.formatToParts(at).map((p) => [p.type, p.value]));
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.get(type) ?? "";
  const safe = dataset.replace(/[^A-Za-z0-9_-]/gu, "_");
  return `${safe}-${part("year")}-${part("month")}-${part("day")}-${part("hour")}${part("minute")}.${extension}`;
}

/** How tightly rows are packed: a comfortable grid's rows and header are taller by `DENSITY_STEP` pixels. */
export type Density = "compact" | "comfortable";

/** The sizes a grid draws with, in CSS pixels, from its tokens. */
interface Metrics {
  readonly rowPx: number;
  readonly headerPx: number;
  /** Between a cell's edge and its text. */
  readonly padding: number;
  /** Each level of the group column's tree. */
  readonly indent: number;
  /** The header's icons: the funnel, the pin and a measure's chevron. */
  readonly iconPx: number;
  /** The room a header keeps at its right for the funnel that opens the column's menu. */
  readonly funnelPx: number;
  /** The room before a group's label for its expand marker. */
  readonly markerPx: number;
  /** A sort arrow. */
  readonly arrowPx: number;
}

/** A length token in pixels, or `otherwise` if it is not one. */
function pixels(value: string, otherwise: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : otherwise;
}

/** The sizes `tokens` give; `step` is added to the heights, for a grid drawn before its tokens are read. */
function metricsOf(tokens: Theme, step = 0): Metrics {
  const iconPx = pixels(tokens.iconSize, 16) * 0.875;
  const padding = pixels(tokens.cellPadding, 6);
  return {
    rowPx: Math.max(1, Math.round(pixels(tokens.rowHeight, 24) + step)),
    headerPx: Math.max(1, Math.round(pixels(tokens.headerHeight, 24) + step)),
    padding,
    indent: pixels(tokens.indent, 14),
    iconPx,
    funnelPx: iconPx + padding,
    markerPx: iconPx + 4,
    arrowPx: Math.round(iconPx * 0.85)
  };
}

/** Whether a colour draws nothing, so the line it would draw can be skipped. */
function invisible(color: string): boolean {
  return color === "transparent" || color === "rgba(0, 0, 0, 0)";
}

/**
 * Whether a colour lets what is under it show, as `rgba()` and `color(… / alpha)` with an alpha below 1 do. A cell
 * filled with one is filled with the background first, so that redrawing it never piles the colour up.
 */
function translucent(color: string): boolean {
  const alpha = (/^rgba\((?:[^,]*,){3}\s*([\d.]+%?)\s*\)$/.exec(color) ?? /\/\s*([\d.]+%?)\s*\)$/.exec(color))?.[1];
  return invisible(color) || (alpha !== undefined && (alpha.endsWith("%") ? Number.parseFloat(alpha) < 100 : Number(alpha) < 1));
}

/** How close to a header edge, in pixels, the pointer starts a resize. */
const EDGE = 4;
const TOOLTIP_DELAY_MS = 350;
/** How far a pressed header must move, in pixels, before it is dragged rather than clicked. */
const DRAG_THRESHOLD = 6;
/** The widest a column is fitted to its values; wider ones are cut, and can be widened by hand. */
const MAX_FITTED = 320;
/** The icons a header draws, as SVG path data on a 16-unit square. */
const FUNNEL_PATH = "M2.5 3h11L9.25 8.25v4.75l-2.5-1.25V8.25z";
const PIN_PATH = "M5.5 2.5h5M6.5 2.5v4l-2 2.5h7l-2-2.5v-4M8 9v5";
/** The mark of a pivot measure's menu, where a column has its funnel: a measure is not filtered from its header. */
const CHEVRON_PATH = "M4 6l4 4 4-4";
/** A group's expand marker: open, and closed. */
const OPEN_PATH = "M4.5 6.5l3.5 3.5 3.5-3.5";
const CLOSED_PATH = "M6.5 4.5l3.5 3.5-3.5 3.5";
/** A column's sort, ascending and descending. */
const UP_PATH = "M8 12.5v-9M4.5 7L8 3.5 11.5 7";
const DOWN_PATH = "M8 3.5v9M4.5 9L8 12.5 11.5 9";
/** How strongly a funnel draws on a header the pointer isn't over, so that it is there to find but not loud. */
const RESTING_FUNNEL = 0.5;

/** A column's sort as its header shows it: the direction, and the priority when there are several sorts. */
interface SortMark {
  readonly descending: boolean;
  readonly priority: number | null;
}

const FLAG_NOTES: Readonly<Record<CellFlag, string | null>> = {
  [CellFlag.Ok]: null,
  [CellFlag.Overflow]: "The exact result needs more than 38 digits, so it is not shown.",
  [CellFlag.Mixed]: "This group combines values in different units, so they are not added.",
  [CellFlag.Undefined]: "Undefined, such as a share of a zero total."
};

type Parsed = { readonly ok: true; readonly layout: Layout } | { readonly ok: false; readonly error: string };

/** Where the pointer is. */
interface Hit {
  readonly header: boolean;
  /** The view row, for the body. */
  readonly row: number | null;
  /** -1 for the group column, a data column, or null past the last column. */
  readonly column: number | null;
  /** The column whose right edge is under the pointer in the header, -1 for the group column. */
  readonly edge: number | null;
  /** Whether the pointer is on the header's funnel, which opens the column's menu. */
  readonly funnel: boolean;
}

/** The scrolled area a pass draws. */
interface Area {
  readonly first: number;
  readonly scrollLeft: number;
  readonly width: number;
  readonly height: number;
}

/** One pass of drawing: the context, tokens and geometry it uses. */
interface Pass {
  readonly context: CanvasRenderingContext2D;
  readonly theme: Theme;
  readonly rowPx: number;
  readonly headerPx: number;
  /** The line under each row, or null for none. */
  readonly rowRule: string | null;
  /** The row under the pointer and its highlight, or null for none. */
  readonly hover: { readonly row: number; readonly color: string } | null;
  /** Whether the rows are a grouped grid's, whose group rows have a background of their own. */
  readonly detail: boolean;
  /** The fonts of the body, of group rows and of the header. */
  readonly fonts: { readonly body: string; readonly group: string; readonly header: string };
  readonly full: boolean;
  readonly geometry: ColumnGeometry;
  readonly scrollLeft: number;
  readonly width: number;
  readonly range: CellRange | null;
  readonly focus: CellRef | null;
  /** Rows to redraw even if their text has not changed, because the selection moved over them. */
  readonly stale: ReadonlySet<number>;
  /** The search the frame's rows matched, whose text is highlighted; empty for none. */
  readonly search: string;
  /** The columns that search looks in. */
  readonly searched: ReadonlySet<string>;
  /** Whether the search looks in the group labels. */
  readonly labelsSearched: boolean;
}

/** No highlighted ranges. */
const NO_MARKS: readonly (readonly [number, number])[] = [];

/**
 * How a data cell draws: its colour, whether it aligns right, and the search's matches to mark. A detail view's group
 * row holds its totals, which align as numbers whatever the column holds.
 */
function cellStyle(
  pass: Pass,
  data: FrameColumn,
  kind: RowKind | null,
  text: string,
  flag: CellFlag
): { readonly color: string; readonly right: boolean; readonly marks: readonly (readonly [number, number])[] } {
  const { theme } = pass;
  const numeric = data.total !== null && kind === "group" ? data.totalNumeric : data.numeric;
  const color = flag !== CellFlag.Ok ? theme.muted : numeric && isNegativeText(text) ? theme.negative : theme.foreground;
  const marks = pass.search !== "" && !numeric && pass.searched.has(data.name) ? highlightRanges(text, pass.search) : NO_MARKS;
  return { color, right: numeric && flag === CellFlag.Ok, marks };
}

/** Counts as the export writes them. */
const GROUPED = new Intl.NumberFormat("en-US");

/**
 * A row's text in the group column: its label and, for a detail view's group row, how many rows it holds, as the
 * export writes it. Drawing, fitting and copying share it, so the screen, the clipboard and the file agree.
 */
function groupText(tree: TreeRows, local: number): string {
  const count = tree.rows(local);
  return count === null ? tree.label(local) : `${tree.label(local)} (${GROUPED.format(count)})`;
}

function isGrouped(layout: Layout): boolean {
  return layout.group_by.length > 0 || layout.split_by.length > 0 || layout.measures.length > 0;
}

/** A pivot of measures, rather than a list of rows, grouped or not. */
function isPivot(layout: Layout): boolean {
  return isGrouped(layout) && !layout.detail;
}

function parse(input: LayoutInput): Parsed {
  const checked = checkLayout(input);
  return checked.ok ? checked : { ok: false, error: `Invalid layout: ${checked.error}` };
}

const GRID_STYLES = `
  px-grid {
    display: flex;
    flex-direction: column;
    position: relative;
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border: var(--_px-wrapper-border);
    border-radius: var(--_px-wrapper-radius);
    font: var(--_px-font-size) var(--_px-font-family);
    color: var(--_px-foreground);
    background: var(--_px-background);
  }
  /* A grid inside a pivot is framed by the pivot. */
  px-pivot px-grid {
    border: none;
    border-radius: 0;
  }
  px-grid .px-body {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  px-grid.px-auto-height {
    height: auto;
  }
  px-grid .px-scroll {
    position: absolute;
    inset: 0;
    overflow: auto;
    outline: none;
    scrollbar-width: thin;
  }
  px-grid .px-pinned-edge {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    background: linear-gradient(to right, var(--_px-pinned-shadow), transparent);
    pointer-events: none;
  }
  px-grid .px-scroll:focus-visible {
    box-shadow: inset 0 0 0 2px var(--_px-selection-border);
  }
  px-grid .px-spacer {
    position: absolute;
    top: 0;
    left: 0;
  }
  px-grid .px-canvas {
    position: sticky;
    top: 0;
    left: 0;
    display: block;
  }
  px-grid .px-error {
    position: absolute;
    inset: auto 0 0 0;
    padding: calc(var(--_px-spacing) * 1.5) calc(var(--_px-spacing) * 2.5);
    background: var(--_px-danger);
    color: var(--_px-on-accent);
  }
  px-grid .px-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  px-grid .px-menu-anchor {
    position: absolute;
    pointer-events: none;
  }
  px-grid .px-tooltip {
    position: absolute;
    z-index: 2;
    max-width: 480px;
    padding: var(--_px-spacing) calc(var(--_px-spacing) * 2);
    border: 1px solid var(--_px-border-color);
    border-radius: var(--_px-radius);
    background: var(--_px-background);
    color: var(--_px-foreground);
    white-space: pre-wrap;
    word-break: break-word;
    pointer-events: none;
    box-shadow: var(--_px-shadow);
  }

`;

@Component({
  selector: "px-grid",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [ColumnMenuComponent, GridToolbarComponent, GroupPanelComponent, PopoverComponent, StatusBarComponent],
  host: { "[attr.data-px-theme]": "theming.theme().name", "[attr.data-px-scheme]": "theming.resolved()", "[attr.data-px-density]": "density()", "[class.px-auto-height]": "height() === 'auto'" },
  template: `
    @if (toolbarView(); as bar) {
      <px-grid-toolbar #toolbar [layout]="bar.layout" [fields]="fields()" [parts]="bar.parts" (changed)="layout.set($event)" (exported)="export($event)" />
    }
    @if (groupPanel(); as grouped) {
      <px-group-panel #groupPanel [layout]="grouped" [dropping]="overPanel()" (changed)="layout.set($event)" />
    }
    <div class="px-body" [style.height.px]="bodyHeight()" [style.flex]="bodyHeight() === null ? null : 'none'">
      <div
        class="px-scroll"
        #scroll
        tabindex="0"
        role="grid"
        aria-multiselectable="true"
        [attr.aria-rowcount]="totalRows()"
        [attr.aria-colcount]="geometry().count"
        (scroll)="onScroll()"
        (keydown)="onKey($event)"
        (copy)="onCopy($event)"
      >
        <div class="px-spacer" [style.height.px]="spacerHeight()" [style.width.px]="geometry().contentWidth"></div>
        <canvas
          class="px-canvas"
          #canvas
          [style.cursor]="cursor()"
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (pointerleave)="onPointerLeave()"
          (pointercancel)="endPointer()"
          (lostpointercapture)="endPointer()"
          (dblclick)="onDoubleClick($event)"
        ></canvas>
      </div>
      <div class="px-pinned-edge" [hidden]="pinnedEdge() === null" [style.left.px]="pinnedEdge()"></div>
      @if (menuView(); as m) {
        <div #menuAnchor class="px-menu-anchor" [style.left.px]="m.left" [style.top.px]="m.top" [style.width.px]="m.width" [style.height.px]="m.height"></div>
        <px-popover [anchor]="menuAnchor" [restore]="scroll" alignTo="end" (closed)="menu.set(null)">
          <px-column-menu
            [layout]="m.layout"
            [column]="m.name"
            [measure]="m.measure"
            [fields]="fields()"
            [source]="values"
            (changed)="layout.set($event)"
            (fit)="fitColumn(m.column)"
            (done)="menu.set(null)"
          />
        </px-popover>
      }
      <div class="px-visually-hidden" role="status" aria-label="Totals row" [hidden]="totalsText() === null">{{ totalsText() }}</div>
      @if (tooltip(); as tip) {
        <div class="px-tooltip" role="tooltip" [style.left.px]="tip.x" [style.top.px]="tip.y">{{ tip.text }}</div>
      }
      @if (error(); as message) {
        <div class="px-error" role="alert">{{ message }}</div>
      }
    </div>
    <px-status-bar
      [dataset]="current()?.dataset ?? ''"
      [parameters]="current()?.parameters ?? {}"
      [viewRows]="source.frame()?.totalRows ?? null"
      [sourceAsOf]="source.frame()?.sourceAsOfMicros ?? null"
      [status]="source.status()"
      [placement]="source.placement()"
      [message]="message()"
    />
  `,
  styles: GRID_STYLES
})
export class GridComponent {
  /** The view: dataset, grouping, sorting, formats and widths. Bind it two ways with `[(layout)]`. */
  public readonly layout = model.required<LayoutInput>();
  /** The theme, from `defineTheme`; by default the one given to `provideParallax`, else the standard theme. A token set in CSS wins over it. */
  public readonly theme = input<ParallaxTheme | undefined>(undefined);
  /** The light or dark scheme, or `auto` to follow the system; by default the one given to `provideParallax`, else light. */
  public readonly scheme = input<Scheme | undefined>(undefined);
  /** The theme and scheme in effect. */
  protected readonly theming = themed(this.theme, this.scheme);
  /** How tightly rows are packed. */
  public readonly density = input<Density>("compact");
  /** Fires when the user double-clicks a value in a grouped view, asking for the rows behind its group. */
  public readonly drill = output<DrillRequest>();
  /**
   * The toolbar above the grid: true shows all of it, false hides it, and an object turns parts off, such as
   * `{ export: false }` for a small tile.
   */
  public readonly toolbar = input<boolean | Partial<ToolbarParts>>(true);
  /** `fill` takes the height its container gives; `auto` sizes the grid to its rows, up to `maxHeight`. */
  public readonly height = input<"fill" | "auto">("fill");
  /** The tallest an `auto` grid's rows grow, in CSS pixels, before they scroll. */
  public readonly maxHeight = input(480);
  /** The body's height for an `auto` grid: the header, every row and the totals, up to the maximum. */
  protected readonly bodyHeight = computed(() => {
    if (this.height() === "fill") {
      return null;
    }
    // Room for a horizontal scrollbar, so it never covers the last row.
    const scrollbar = this.geometry().contentWidth > this.widthPx() ? this.scrollbarPx() : 2;
    return Math.min(this.maxHeight(), (this.totalRows() + this.footer()) * this.rowHeight() + this.headerHeight() + scrollbar);
  });
  protected readonly toolbarParts = computed((): ToolbarParts | null => {
    const setting = this.toolbar();
    if (setting === false) {
      return null;
    }
    const parts = setting === true ? ALL_PARTS : { ...ALL_PARTS, ...setting };
    // A pivot's columns are its measures, and its grand total is a row of its own.
    const layout = this.current();
    const pivot = layout !== null && isPivot(layout);
    return pivot ? { ...parts, columns: false, totals: false } : parts;
  });
  private readonly toolbarRef = viewChild<GridToolbarComponent>("toolbar");
  protected readonly toolbarView = computed(() => {
    const parts = this.toolbarParts();
    const layout = this.current();
    return parts === null || layout === null ? null : { parts, layout };
  });
  /** The column whose menu is open, and where its header is, over the grid's body. */
  /** The open header menu: its data column, and the source column it edits or, for a pivot, the measure. */
  protected readonly menu = signal<{
    readonly column: number;
    readonly name: string;
    readonly measure: number | null;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  } | null>(null);
  protected readonly menuView = computed(() => {
    const menu = this.menu();
    const layout = this.current();
    return menu === null || layout === null ? null : { ...menu, layout };
  });
  /** The header column under the pointer. */
  private readonly hoverHeader = signal<number | null>(null);
  /** The view row under the pointer, which the theme's row hover highlights. */
  private readonly hoverRow = signal<number | null>(null);
  /** Where the pointer is over the canvas, to find the row under it again after a scroll; null once it leaves. */
  private pointerAt: { readonly x: number; readonly y: number } | null = null;
  /** The pinned columns' right edge while columns scroll under them, where their shadow falls; null otherwise. */
  protected readonly pinnedEdge = computed(() => {
    const geometry = this.geometry();
    return geometry.pinned > 0 && this.scrollLeft() > 0 ? geometry.frozenPx : null;
  });
  /** The group panel shows above a grid, flat or grouped, whose toolbar keeps it; a pivot has its settings instead. */
  protected readonly groupPanel = computed(() => {
    const parts = this.toolbarParts();
    const layout = this.current();
    return parts === null || !parts.group || layout === null || isPivot(layout) ? null : layout;
  });
  private readonly groupPanelRef = viewChild<string, ElementRef<HTMLElement>>("groupPanel", { read: ElementRef });
  /** Whether a dragged header is over the group panel, where dropping it groups by its column. */
  protected readonly overPanel = signal(false);
  /** A header being dragged to another place: the column, and the column it would go before, or the count for last. */
  private readonly drag = signal<{ readonly from: number; readonly before: number } | null>(null);
  /** Lists a column's values for the header menu's filter. */
  protected readonly values = (column: string, search: string, limit: number): Promise<DistinctValues> => this.source.distinct(column, search, limit);

  private readonly parsed = computed(() => parse(this.layout()));
  protected readonly current = computed(() => {
    const parsed = this.parsed();
    return parsed.ok ? parsed.layout : null;
  });
  protected readonly source = gridSource(this.current);
  /** The dataset's columns, once the view has opened. */
  public readonly fields = this.source.fields;
  protected readonly error = computed(() => {
    const parsed = this.parsed();
    return parsed.ok ? this.source.error() : parsed.error;
  });

  private readonly scroll = viewChild.required<ElementRef<HTMLDivElement>>("scroll");
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>("canvas");
  private readonly scrollTop = signal(0);
  private readonly scrollLeft = signal(0);
  private readonly viewportPx = signal(600);
  /** How tall a horizontal scrollbar is, measured once one shows; until then, the widest a browser draws. */
  private readonly scrollbarPx = signal(14);
  private readonly widthPx = signal(800);
  private readonly selection = signal<Selection | null>(null);
  /** A width being dragged, before it is committed to the layout. */
  private readonly liveWidth = signal<{ readonly key: string; readonly width: number } | null>(null);
  protected readonly cursor = signal("default");
  protected readonly tooltip = signal<{ readonly x: number; readonly y: number; readonly text: string } | null>(null);
  protected readonly message = signal("");

  /** The sizes the tokens give, or the defaults until they are read. */
  protected readonly metrics = computed(() => {
    const tokens = this.palette();
    return tokens === null ? metricsOf(defaultTheme("light"), this.density() === "comfortable" ? DENSITY_STEP : 0) : metricsOf(tokens);
  });
  protected readonly rowHeight = computed(() => this.metrics().rowPx);
  protected readonly headerHeight = computed(() => this.metrics().headerPx);
  protected readonly totalRows = computed(() => this.source.frame()?.totalRows ?? 0);
  /** A footer row for the totals, when the view has them. */
  protected readonly footer = computed(() => ((this.source.frame()?.totals ?? null) === null ? 0 : 1));
  private readonly rows = computed(() => rowGeometry(this.totalRows() + this.footer(), this.rowHeight(), this.headerHeight()));
  /** The totals row as text, for screen readers, which cannot read the canvas: each total with its column's title. */
  protected readonly totalsText = computed(() => {
    const totals = this.source.frame()?.totals ?? null;
    if (totals === null) {
      return null;
    }
    const parts = totals.filter((t) => t.text(0) !== "").map((t) => `${t.title}: ${t.text(0)}`);
    return parts.length === 0 ? null : `Totals. ${parts.join("; ")}`;
  });
  /** Widths fitted to the loaded values of columns the user has not sized. */
  private readonly fitted = signal<Readonly<Record<string, number>>>({});
  /** How many rows each fitted width was measured over. */
  private fittedOver = new Map<string, number>();
  protected readonly spacerHeight = computed(() => this.rows().spacerPx);
  protected readonly geometry = computed((): ColumnGeometry => {
    const layout = this.current();
    const count = this.source.frame()?.totalColumns ?? 0;
    const live = this.liveWidth();
    const widths = { ...(layout?.column_widths ?? {}), ...(live === null ? {} : { [live.key]: live.width }) };
    if (layout !== null && isPivot(layout)) {
      // A measure's columns, one under each pivot value, share its fitted width, and a width the user set wins.
      return groupedGeometry(count, layout.measures.length, { ...this.fitted(), ...widths });
    }
    const names = layout === null ? this.source.fields().map((f) => f.name) : shownColumns(layout, this.source.fields());
    const pinned = layout === null ? 0 : layout.pinned.filter((c) => names.includes(c)).length;
    // A detail view keeps its group column at the left, as a pivot does, before its own columns.
    const treePx = layout !== null && layout.detail && layout.group_by.length > 0 ? Math.max(MIN_WIDTH, widths[TREE_WIDTH_KEY] ?? DEFAULT_TREE_WIDTH) : 0;
    return flatGeometry(count, names, widths, pinned, this.fitted(), treePx);
  });
  private readonly extent = computed((): Extent => ({ rows: this.totalRows(), columns: this.geometry().count, tree: this.geometry().treePx > 0 }));

  private stats: DrawStats = { frames: 0, fullDraws: 0, cellDraws: 0, drawMs: 0, latencyMs: [], firstRows: null, changes: [] };
  /** When the rows of the last frame timed were asked for, so that each request is counted once. */
  private timedRequest: number | null = null;
  private timedChange: number | null = null;
  private drawn = new Map<string, string>();
  private drawnRows = new Set<number>();
  /** Full text of cells drawn cut short, and notes for flagged cells, by cell key. */
  private notes = new Map<string, string>();
  private shape = "";
  /** The tokens of the last full redraw. */
  private tokens: Theme | null = null;
  /** The tokens in effect, read again whenever the theme may have changed; equal tokens leave it as it is. */
  private readonly palette = signal<Theme | null>(null, { equal: (a, b) => a === b || (a !== null && b !== null && sameTheme(a, b)) });
  /** Measured text widths, by font and then text. */
  private readonly textWidths = new Map<string, Map<string, number>>();
  /** The font the drawing context was last given, which `measure` measures in. */
  private font = "";
  /** The padding of the pass being drawn. */
  private padding = 6;
  private pressed: { readonly hit: Hit; readonly x: number; readonly startWidth: number; readonly key: string } | null = null;
  private selecting = false;
  /** The selection as last drawn, to find the rows a new selection changes. */
  private drawnRange: CellRange | null = null;
  /** The row highlighted under the pointer as last drawn. */
  private drawnHover: number | null = null;
  private drawnFocus: CellRef | null = null;
  /** Rows fetched for a copy that could not reach the clipboard at once, kept for the next Ctrl+C. */
  private prepared: { readonly key: string; readonly text: string } | null = null;
  private tooltipTimer: ReturnType<typeof setTimeout> | null = null;
  /** The row count of the last frame, to tell when rows shrink to end above the view. */
  private shownRows = 0;

  private readonly document = inject(DOCUMENT);
  private readonly client = inject(ParallaxClient);

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Measure once rendered and whenever the grid resizes; that also asks for the first rows.
    afterNextRender(() => {
      const observer = new ResizeObserver(() => {
        this.onScroll();
      });
      observer.observe(this.scroll().nativeElement);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        this.clearTooltip();
      });
      this.onScroll();
    });
    // Ask for what is in view whenever scrolling, resizing or a new column count changes it.
    effect(() => {
      this.source.show(this.visible());
    });
    // Columns the user has not sized fit their values: every row of a small view, else the first rows loaded.
    effect(() => {
      const frame = this.source.frame();
      const layout = this.current();
      untracked(() => {
        this.fitColumns(frame, layout);
      });
    });
    // When the rows shrink to end at or above the first row in view, as after a search, show them from the top.
    // The engine answers such a change from row 0, so the rows are already here.
    effect(() => {
      const rows = this.source.frame()?.totalRows ?? null;
      untracked(() => {
        const before = this.shownRows;
        this.shownRows = rows ?? 0;
        if (rows === null || rows >= before) {
          return;
        }
        const first = rowGeometry(before, this.rowHeight(), this.headerHeight()).firstRow(this.scrollTop(), this.viewportPx());
        if (rows <= first) {
          this.scroll().nativeElement.scrollTop = 0;
          this.scrollTop.set(0);
        }
      });
    });
    // The tokens come from the page's styles, so they are read once rendered, and again whenever they may have changed.
    afterRenderEffect(() => {
      this.theming.theme();
      this.theming.resolved();
      this.theming.changes();
      this.density();
      const tokens = readTheme(this.canvas().nativeElement);
      untracked(() => {
        const font = this.palette()?.font;
        this.palette.set(tokens);
        if (font !== undefined && font !== tokens.font) {
          // Text measured in the old font is the wrong width now, so columns fitted to it are fitted again.
          this.textWidths.clear();
          this.fittedOver = new Map();
          this.fitted.set({});
          this.fitColumns(this.source.frame(), this.current());
        }
      });
    });
    afterRenderEffect(() => {
      // Reading these tracks them; any change redraws.
      this.palette();
      this.geometry();
      this.selection();
      this.hoverRow();
      this.draw(this.source.frame(), this.scrollTop(), this.scrollLeft(), this.viewportPx(), this.widthPx());
    });
  }

  /** Drawing counters, for measurement. */
  public drawStats(): DrawStats {
    return this.stats;
  }

  /**
   * Reads the theme's tokens again and redraws if they changed. The grid notices its inputs, the system's colour
   * scheme, fonts loading and changes to the attributes of `<html>` and `<body>` by itself; call this after changing
   * a token any other way, such as a class on a wrapper.
   */
  public refreshTheme(): void {
    this.theming.refresh();
  }

  /** The tokens in effect, read now if they have not been yet. */
  private currentTokens(): Theme {
    return untracked(() => this.palette()) ?? readTheme(this.canvas().nativeElement);
  }

  /**
   * Downloads the view as an Excel workbook or a CSV file. A view of data the app
   * loaded is written by the browser's engine, which holds its table. Otherwise the
   * browser posts the layout in a form to the server and streams the answer to
   * disk, so a large export never sits in the page's memory. A refusal, such as
   * more rows than Excel holds, comes back as text, which the status bar shows.
   */
  public export(format: "xlsx" | "csv"): void {
    const layout = this.current();
    if (layout === null) {
      return;
    }
    if (this.source.placement()?.loaded === true) {
      this.exportInBrowser(layout, format);
      return;
    }
    const token = `${String(Date.now())}-${String(Math.random()).slice(2)}`;
    const target = `px-export-${token}`;
    const frame = this.document.createElement("iframe");
    frame.name = target;
    frame.hidden = true;
    // Downloads never reach the page; a refusal posts its reason here, which works
    // even when the server is on another origin and the frame cannot be read.
    const window = this.document.defaultView;
    const listen = (event: MessageEvent<unknown>): void => {
      const posted = exportRefusal.safeParse(event.data);
      if (posted.success && posted.data.token === token) {
        this.message.set(`Export failed: ${posted.data.error}`);
      }
    };
    window?.addEventListener("message", listen);
    this.document.body.append(frame);
    setTimeout(() => {
      window?.removeEventListener("message", listen);
      frame.remove();
    }, 600_000);
    const form = this.document.createElement("form");
    form.method = "post";
    form.action = this.client.exportUrl();
    form.target = target;
    // The server refuses to export another load than the screen shows, so the file holds what the screen does.
    const shown = this.source.frame()?.loadVersion;
    for (const [name, value] of [["layout", JSON.stringify(layout)], ["format", format], ["token", token], ...(shown === undefined ? [] : [["load_version", shown.toString()] as const])] as const) {
      const field = this.document.createElement("input");
      field.type = "hidden";
      field.name = name;
      field.value = value;
      form.append(field);
    }
    this.document.body.append(form);
    form.submit();
    form.remove();
    this.message.set(format === "xlsx" ? "Exporting to Excel; your browser will save the file." : "Exporting to CSV; your browser will save the file.");
  }

  /** Writes the export in the browser's engine and saves it as a download, refusing another load than the screen shows. */
  private exportInBrowser(layout: Layout, format: "xlsx" | "csv"): void {
    const shown = this.source.frame()?.loadVersion ?? null;
    const name = exportFileName(layout.dataset, format, new Date());
    this.message.set(format === "xlsx" ? "Exporting to Excel…" : "Exporting to CSV…");
    this.client.export(JSON.stringify(layout), format, shown).then(
      (file) => {
        const url = URL.createObjectURL(file);
        const link = this.document.createElement("a");
        link.href = url;
        link.download = name;
        link.hidden = true;
        this.document.body.append(link);
        link.click();
        link.remove();
        // The download has its own reference to the file once it starts.
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 60_000);
        this.message.set(format === "xlsx" ? "Exported to Excel; your browser saves the file." : "Exported to CSV; your browser saves the file.");
      },
      (failure: unknown) => {
        this.message.set(`Export failed: ${failure instanceof Error ? failure.message : String(failure)}`);
      }
    );
  }

  /** Lists a column's values under the view's other filters, for filter pick-lists. */
  public distinctValues(column: string, search: string, limit: number): Promise<DistinctValues> {
    return this.source.distinct(column, search, limit);
  }

  // ---- Scrolling ---------------------------------------------------------

  protected onScroll(): void {
    const element = this.scroll().nativeElement;
    this.scrollTop.set(element.scrollTop);
    this.scrollLeft.set(element.scrollLeft);
    this.viewportPx.set(element.clientHeight);
    this.widthPx.set(element.clientWidth);
    const scrollbar = element.offsetHeight - element.clientHeight;
    if (scrollbar > 0) {
      this.scrollbarPx.set(scrollbar);
    }
    this.hoverAt(this.pointerAt);
  }

  /** Highlights the row at `at`, or none, if the theme highlights rows under the pointer. */
  private hoverAt(at: { readonly x: number; readonly y: number } | null): void {
    const tokens = untracked(this.palette);
    if (tokens === null || invisible(tokens.rowHover)) {
      return;
    }
    this.hoverRow.set(at === null ? null : this.hit(at.x, at.y).row);
  }

  /** The rows and data columns in view. Before the first frame, when the column count is unknown, it covers the width at default widths. */
  private visible(): Viewport {
    const geometry = this.geometry();
    const rowPx = this.rowHeight();
    const scrollLeft = this.scrollLeft();
    const width = this.widthPx();
    const firstRow = this.rows().firstRow(this.scrollTop(), this.viewportPx());
    const rowCount = Math.ceil(this.viewportPx() / rowPx) + 1;
    if (geometry.count === 0) {
      return { firstRow, rowCount, firstColumn: 0, columnCount: Math.ceil(width / DEFAULT_WIDTH) + 1 };
    }
    // Pinned columns show whatever the scroll, so the window always starts with them.
    const left = geometry.pinned > 0 ? 0 : geometry.indexAt(geometry.frozenPx + scrollLeft);
    const right = geometry.indexAt(scrollLeft + width);
    return { firstRow, rowCount, firstColumn: left, columnCount: right - left + 1 };
  }

  private firstVisibleRow(): number {
    return this.rows().firstRow(this.scrollTop(), this.viewportPx());
  }

  /** Scrolls so that `cell` is in view. */
  private reveal(cell: CellRef): void {
    const element = this.scroll().nativeElement;
    const rowPx = this.rowHeight();
    const visibleRows = Math.max(1, Math.floor((element.clientHeight - this.headerHeight()) / rowPx));
    const first = this.firstVisibleRow();
    if (cell.row < first) {
      element.scrollTop = this.rows().scrollTopFor(cell.row, element.clientHeight);
    } else if (cell.row >= first + visibleRows) {
      element.scrollTop = this.rows().scrollTopFor(cell.row - visibleRows + 1, element.clientHeight);
    }
    const geometry = this.geometry();
    if (cell.column >= geometry.pinned) {
      const x = geometry.x(cell.column) - element.scrollLeft;
      if (x < geometry.frozenPx) {
        element.scrollLeft = geometry.x(cell.column) - geometry.frozenPx;
      } else if (x + geometry.width(cell.column) > element.clientWidth) {
        element.scrollLeft = geometry.x(cell.column) + geometry.width(cell.column) - element.clientWidth;
      }
    }
  }

  // ---- Pointer -----------------------------------------------------------

  private hit(x: number, y: number): Hit {
    const { rowPx, headerPx } = this.metrics();
    const geometry = this.geometry();
    const header = y < headerPx;
    // The totals footer at the bottom is not a row of the view.
    const onFooter = this.footer() > 0 && y >= this.viewportPx() - rowPx;
    const row = header || onFooter ? null : this.firstVisibleRow() + Math.floor((y - headerPx) / rowPx);
    const column = columnAt(geometry, x, this.scrollLeft());
    let edge: number | null = null;
    if (column === -1) {
      if (header && geometry.treePx - x <= EDGE) {
        edge = -1;
      }
    } else {
      if (header && column !== null) {
        const part = this.headerPart(column, x);
        if (part === "funnel") {
          return { header, row: null, column, edge: null, funnel: true };
        }
        edge = part;
      }
    }
    return { header, row: row !== null && row < this.totalRows() ? row : null, column, edge, funnel: false };
  }

  /** The part of data column `column`'s header at `x`: the edge of a column, the funnel, or neither. */
  private headerPart(column: number, x: number): number | "funnel" | null {
    const geometry = this.geometry();
    const left = screenX(geometry, column, this.scrollLeft());
    const right = left + geometry.width(column);
    if (right - x <= EDGE) {
      return column;
    }
    if (x - left <= EDGE && column > 0) {
      return column - 1;
    }
    return right - x <= this.metrics().funnelPx && this.hasMenu(column) ? "funnel" : null;
  }

  private widthKeyOf(column: number): string {
    return column === -1 ? TREE_WIDTH_KEY : this.geometry().widthKey(column);
  }

  private widthOf(column: number): number {
    const geometry = this.geometry();
    return column === -1 ? geometry.treePx : geometry.width(column);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    this.clearTooltip();
    const hit = this.hit(event.offsetX, event.offsetY);
    const canvas = this.canvas().nativeElement;
    if (hit.header) {
      const key = hit.edge === null ? "" : this.widthKeyOf(hit.edge);
      this.pressed = { hit, x: event.clientX, startWidth: hit.edge === null ? 0 : this.widthOf(hit.edge), key };
      // A resize, or a header dragged to another place, follows the pointer off the canvas.
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (hit.row === null || hit.column === null) {
      return;
    }
    this.scroll().nativeElement.focus({ preventScroll: true });
    const cell = { row: hit.row, column: hit.column };
    const previous = this.selection();
    this.selection.set(event.shiftKey && previous !== null ? { anchor: previous.anchor, focus: cell } : { anchor: cell, focus: cell });
    this.selecting = true;
    canvas.setPointerCapture(event.pointerId);
    if (hit.column === -1 && !event.shiftKey && this.onMarker(hit.row, event.offsetX)) {
      this.toggleRow(hit.row);
    }
  }

  /**
   * Handles the grid's own shortcuts: Ctrl+F searches the grid rather than the page, and Alt+Down opens the focused
   * cell's column menu, as a spreadsheet's filter does. Returns whether it handled `event`.
   */
  private shortcut(event: KeyboardEvent): boolean {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f") {
      return this.toolbarRef()?.focusSearch() === true;
    }
    const focus = this.selection()?.focus;
    if (event.altKey && event.key === "ArrowDown" && focus !== undefined && this.hasMenu(focus.column)) {
      this.openMenu(focus.column);
      return true;
    }
    return false;
  }

  /**
   * Follows a pressed header that moved past the threshold: it is dragged, and drops before the column whose middle
   * the pointer is left of. Returns whether the press is a drag.
   */
  private dragHeader(pressed: { readonly hit: Hit; readonly x: number }, event: PointerEvent): boolean {
    const from = pressed.hit.column;
    if (!pressed.hit.header || pressed.hit.funnel || from === null || this.menuColumn(from) === null) {
      return false;
    }
    if (this.drag() === null && Math.abs(event.clientX - pressed.x) < DRAG_THRESHOLD) {
      return false;
    }
    const panel = this.groupPanelRef()?.nativeElement.getBoundingClientRect();
    this.overPanel.set(panel !== undefined && event.clientY >= panel.top && event.clientY <= panel.bottom && event.clientX >= panel.left && event.clientX <= panel.right);
    const geometry = this.geometry();
    const at = columnAt(geometry, event.offsetX, this.scrollLeft()) ?? geometry.count - 1;
    const column = Math.max(0, at);
    const middle = screenX(geometry, column, this.scrollLeft()) + geometry.width(column) / 2;
    this.drag.set({ from, before: event.offsetX < middle ? column : column + 1 });
    this.clearTooltip();
    this.cursor.set("grabbing");
    return true;
  }

  /** Moves dragged column `from` to just before column `before`, within its zone. */
  private dropHeader(from: number, before: number): void {
    const geometry = this.geometry();
    if (before === from || before === from + 1) {
      return;
    }
    const name = geometry.widthKey(from);
    const target = before < geometry.count ? geometry.widthKey(before) : null;
    this.change((layout) => withColumnBefore(layout, this.fields(), name, target));
  }

  /** Whether `x` falls on the expand marker of row `row`'s group cell. */
  private onMarker(row: number, x: number): boolean {
    const frame = this.source.frame();
    const tree = frame?.tree ?? null;
    const local = frame === null ? -1 : row - frame.firstRow;
    if (frame === null || tree === null || local < 0 || local >= frame.rowCount || tree.expanded(local) === null) {
      return false;
    }
    const { padding, indent, markerPx } = this.metrics();
    const left = padding + tree.depth(local) * indent;
    return x >= left - 4 && x <= left + markerPx;
  }

  /** Ends a drag that the browser cancelled, as when the window loses focus. */
  protected endPointer(): void {
    this.pressed = null;
    this.selecting = false;
    if (this.drag() !== null) {
      this.drag.set(null);
      this.overPanel.set(false);
    }
    if (this.liveWidth() !== null) {
      this.liveWidth.set(null);
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    const pressed = this.pressed;
    if (pressed !== null && pressed.hit.edge !== null) {
      this.liveWidth.set({ key: pressed.key, width: Math.max(MIN_WIDTH, Math.round(pressed.startWidth + event.clientX - pressed.x)) });
      return;
    }
    if (pressed !== null && this.dragHeader(pressed, event)) {
      return;
    }
    const hit = this.hit(event.offsetX, event.offsetY);
    if (this.selecting && hit.row !== null && hit.column !== null) {
      const selection = this.selection();
      if (selection !== null) {
        this.selection.set({ anchor: selection.anchor, focus: { row: hit.row, column: hit.column } });
      }
      return;
    }
    this.cursor.set(hit.edge !== null ? "col-resize" : hit.header && hit.column !== null ? "pointer" : "default");
    this.hoverHeader.set(hit.header ? hit.column : null);
    this.pointerAt = { x: event.offsetX, y: event.offsetY };
    this.hoverAt(this.pointerAt);
    this.scheduleTooltip(hit, event.offsetX, event.offsetY);
  }

  protected onPointerUp(event: PointerEvent): void {
    const pressed = this.pressed;
    this.pressed = null;
    this.selecting = false;
    if (pressed === null) {
      return;
    }
    if (pressed.hit.edge !== null) {
      const live = this.liveWidth();
      this.liveWidth.set(null);
      if (live !== null) {
        this.setWidth(live.key, live.width);
      }
      return;
    }
    const drag = this.drag();
    if (drag !== null) {
      this.drag.set(null);
      if (this.overPanel()) {
        this.overPanel.set(false);
        const name = this.geometry().widthKey(drag.from);
        this.change((layout) => withGroupedBy(layout, name));
      } else {
        this.dropHeader(drag.from, drag.before);
      }
      return;
    }
    const hit = this.hit(event.offsetX, event.offsetY);
    if (hit.header && hit.column !== null && hit.column === pressed.hit.column) {
      if (hit.funnel && pressed.hit.funnel) {
        this.openMenu(hit.column);
      } else {
        this.sortBy(hit.column, event.shiftKey);
      }
    }
  }

  protected onPointerLeave(): void {
    this.clearTooltip();
    this.hoverHeader.set(null);
    this.pointerAt = null;
    this.hoverRow.set(null);
    if (this.pressed === null) {
      this.cursor.set("default");
    }
  }

  protected onDoubleClick(event: MouseEvent): void {
    const hit = this.hit(event.offsetX, event.offsetY);
    if (hit.header && hit.edge !== null) {
      this.setWidth(this.widthKeyOf(hit.edge), this.fitWidth(hit.edge));
    } else if (!hit.header && hit.column === -1 && hit.row !== null && !this.onMarker(hit.row, event.offsetX)) {
      // The marker toggles on a single click, so only the label toggles here.
      this.toggleRow(hit.row);
    } else if (!hit.header && hit.column !== null && hit.column >= 0 && hit.row !== null) {
      this.requestDrill(hit.row, hit.column);
    }
  }

  /** Asks for the rows behind the cell at view row `row` and data column `column`, if its row is one group rather than an Other row. */
  private requestDrill(row: number, column: number): void {
    const frame = this.source.frame();
    const tree = frame?.tree ?? null;
    const local = frame === null ? -1 : row - frame.firstRow;
    const layout = this.current();
    if (frame === null || tree === null || layout === null || !isPivot(layout) || local < 0 || local >= frame.rowCount || tree.kind(local) === "other") {
      return;
    }
    const data = frame.columns[column - frame.firstColumn];
    const split = data?.split ?? null;
    const label = split === null || data === undefined ? tree.label(local) : `${tree.label(local)}, ${data.title.slice(0, data.title.lastIndexOf(" | "))}`;
    this.drill.emit({ path: groupPath(frame, local), split, label });
  }

  // ---- Header menus -----------------------------------------------------

  /** The source column a data column's menu edits, or null where there is no menu: a pivot's columns are measures. */
  private menuColumn(column: number): string | null {
    const layout = this.current();
    if (layout === null || column < 0 || column >= this.geometry().count || isPivot(layout)) {
      return null;
    }
    return this.geometry().widthKey(column);
  }

  /** The measure a pivot's data column shows, whose menu its header opens; null for any other column. */
  private menuMeasure(column: number): number | null {
    const layout = this.current();
    if (layout === null || !isPivot(layout) || layout.measures.length === 0 || column < 0 || column >= this.geometry().count) {
      return null;
    }
    return column % layout.measures.length;
  }

  /** Whether data column `column`'s header opens a menu. */
  private hasMenu(column: number): boolean {
    return this.menuColumn(column) !== null || this.menuMeasure(column) !== null;
  }

  /** Opens data column `column`'s menu below its header: a column's, or a pivot measure's. */
  private openMenu(column: number): void {
    const name = this.menuColumn(column);
    const measure = this.menuMeasure(column);
    if (name === null && measure === null) {
      return;
    }
    const geometry = this.geometry();
    this.clearTooltip();
    this.menu.set({ column, name: name ?? "", measure, left: screenX(geometry, column, this.scrollLeft()), top: 0, width: geometry.width(column), height: this.headerHeight() });
  }

  /**
   * Fits the columns of `frame` the user has not sized to their header and values. A column is measured on the first
   * frame of a view, and again on a frame that holds more of the whole view; widths only grow, so a column never
   * narrows under the pointer.
   */
  private fitColumns(frame: FrameData | null, layout: Layout | null): void {
    if (frame === null) {
      if (this.fittedOver.size > 0) {
        this.fittedOver = new Map();
        this.fitted.set({});
      }
      return;
    }
    const context = this.canvas().nativeElement.getContext("2d");
    if (layout === null || context === null) {
      return;
    }
    this.useFont(context, this.currentTokens().font);
    const whole = frame.firstRow === 0 && frame.rowCount >= frame.totalRows;
    // A pivot's columns are fitted by measure: every column of one measure shares a width.
    const pivot = isPivot(layout);
    const period = Math.max(1, layout.measures.length);
    const keys = frame.columns.map((data, i) => (pivot ? measureWidthKey((frame.firstColumn + i) % period) : data.name));
    const due = new Set(keys.filter((key) => this.needsFit(layout, key, whole, frame.rowCount)));
    let fitted = this.fitted();
    const fitting = frame.columns.map((data, i) => ({ data, key: keys[i] ?? data.name })).filter(({ key }) => due.has(key));
    const widths = this.fittedWidths(
      context,
      fitting.map(({ data }) => data),
      frame.rowCount,
      pivot ? null : layout.pinned,
      frame.tree
    );
    fitting.forEach(({ key }, n) => {
      const width = widths[n] ?? 0;
      if (width > (fitted[key] ?? 0)) {
        fitted = { ...fitted, [key]: width };
      }
    });
    for (const key of due) {
      this.fittedOver.set(key, frame.rowCount);
    }
    if (fitted !== this.fitted()) {
      this.fitted.set(fitted);
    }
  }

  /**
   * Whether column `name` should be fitted to a frame of `rows` rows: never once the user sized it; otherwise when it
   * was never measured, or the frame holds more of the whole view than the last measurement did.
   */
  private needsFit(layout: Layout, name: string, whole: boolean, rows: number): boolean {
    if (layout.column_widths[name] !== undefined) {
      return false;
    }
    const over = this.fittedOver.get(name);
    return over === undefined || (whole && over < rows);
  }

  /**
   * The widths that show each column's first `rows` values and its title with room for its marks, up to a limit; a
   * title has a pin before it if its column is in `pinned`. A pivot's titles name the pivot values and the measure, and
   * would make every column wide, so its columns, whose `pinned` is null, fit their values and are never narrower than
   * the default. Every title is measured in one font and every value in one or two, since setting a font is slow.
   */
  private fittedWidths(context: CanvasRenderingContext2D, columns: readonly FrameColumn[], rows: number, pinned: readonly string[] | null, tree: TreeRows | null): readonly number[] {
    const { padding, funnelPx, iconPx } = untracked(this.metrics);
    const tokens = this.currentTokens();
    this.useFont(context, `${tokens.headerFontWeight} ${tokens.font}`);
    // Room for the title, a sort arrow, the funnel and any pin. A second sort's priority may cut the title, as in Excel.
    const arrow = this.markWidth(context, { descending: false, priority: null });
    const titles = columns.map((data) => (pinned === null ? DEFAULT_WIDTH - 2 * padding - 2 : this.measure(context, data.title) + arrow + funnelPx + (pinned.includes(data.name) ? iconPx + 2 : 0)));
    const values = this.widestTexts(
      context,
      rows,
      tree,
      columns.map((data) => (local: number) => data.text(local))
    );
    return columns.map((_, n) => Math.min(MAX_FITTED, Math.max(MIN_WIDTH, Math.ceil(Math.max(titles[n] ?? 0, values[n] ?? 0) + 2 * padding + 2))));
  }

  /** The width of a header's title in the header's font, with room for `mark`. */
  private titleWidth(context: CanvasRenderingContext2D, title: string, mark: SortMark | null): number {
    const tokens = this.currentTokens();
    this.useFont(context, `${tokens.headerFontWeight} ${tokens.font}`);
    const width = this.measure(context, title) + this.markWidth(context, mark);
    this.useFont(context, tokens.font);
    return width;
  }

  /**
   * For each of `texts`, the widest of the first `rows` texts it gives, each measured in the font its row draws in: a
   * group's row and a grand total in the group font, the rest in the body's. Each font is set once for every column.
   */
  private widestTexts(context: CanvasRenderingContext2D, rows: number, tree: TreeRows | null, texts: readonly ((local: number) => number | string)[]): number[] {
    const tokens = this.currentTokens();
    const widest = texts.map(() => 0);
    for (const strong of tree === null ? [false] : [false, true]) {
      this.useFont(context, strong ? `${tokens.groupFontWeight} ${tokens.font}` : tokens.font);
      for (let local = 0; local < rows; local += 1) {
        const kind = tree?.kind(local) ?? null;
        if ((kind === "group" || kind === "total") !== strong) {
          continue;
        }
        texts.forEach((text, n) => {
          const shown = text(local);
          widest[n] = Math.max(widest[n] ?? 0, typeof shown === "number" ? shown : this.measure(context, shown));
        });
      }
    }
    this.useFont(context, tokens.font);
    return widest;
  }

  protected fitColumn(column: number): void {
    this.setWidth(this.widthKeyOf(column), this.fitWidth(column));
  }

  // ---- Layout changes ----------------------------------------------------

  private change(update: (layout: Layout) => Layout): void {
    const layout = this.current();
    if (layout !== null) {
      this.layout.set(update(layout));
    }
  }

  private setWidth(key: string, width: number): void {
    this.change((layout) => ({ ...layout, column_widths: { ...layout.column_widths, [key]: Math.max(MIN_WIDTH, Math.round(width)) } }));
  }

  /** The width that shows the header and every loaded value of a column. */
  private fitWidth(column: number): number {
    const frame = this.source.frame();
    const context = this.canvas().nativeElement.getContext("2d");
    if (frame === null || context === null) {
      return this.widthOf(column);
    }
    const { padding, indent, markerPx } = untracked(this.metrics);
    const tree = frame.tree;
    if (column === -1) {
      if (tree === null) {
        return this.widthOf(column);
      }
      const [widest] = this.widestTexts(context, frame.rowCount, tree, [(local) => tree.depth(local) * indent + markerPx + this.measure(context, groupText(tree, local))]);
      return Math.max(DEFAULT_TREE_WIDTH / 2, (widest ?? 0) + 2 * padding);
    }
    const data = frame.columns[column - frame.firstColumn];
    if (data === undefined) {
      return this.widthOf(column);
    }
    const [values] = this.widestTexts(context, frame.rowCount, tree, [(local) => data.text(local)]);
    return Math.max(this.titleWidth(context, data.title, { descending: false, priority: null }), values ?? 0) + 2 * padding + 2;
  }

  /** Cycles a column's sort: ascending, descending, then off. Shift adds it to the sorts of a flat view. */
  private sortBy(column: number, additive: boolean): void {
    this.change((layout) => {
      if (column === -1 && isGrouped(layout)) {
        const by = layout.group_sort.by;
        return { ...layout, group_sort: { by: "key", descending: by === "key" ? !layout.group_sort.descending : false } };
      }
      if (isPivot(layout)) {
        const by = layout.group_sort.by;
        const measure = column % Math.max(1, layout.measures.length);
        const same = by !== "key" && by.measure === measure;
        if (!same) {
          return { ...layout, group_sort: { by: { measure }, descending: false } };
        }
        return { ...layout, group_sort: layout.group_sort.descending ? { by: "key", descending: false } : { by: { measure }, descending: true } };
      }
      const name = this.geometry().widthKey(column);
      const existing = layout.sort.find((s) => s.column === name);
      const next = existing === undefined ? { column: name, descending: false } : existing.descending ? null : { column: name, descending: true };
      if (!additive) {
        return { ...layout, sort: next === null ? [] : [next] };
      }
      const others = layout.sort.filter((s) => s.column !== name);
      return { ...layout, sort: next === null ? others : existing === undefined ? [...others, next] : layout.sort.map((s) => (s.column === name ? next : s)) };
    });
  }

  private toggleRow(row: number): void {
    const frame = this.source.frame();
    if (frame === null) {
      return;
    }
    const local = row - frame.firstRow;
    if (local < 0 || local >= frame.rowCount) {
      return;
    }
    const entry = this.source.toggle(frame, local);
    if (entry !== null) {
      this.change((layout) => withExpanded(layout, entry));
    }
  }

  // ---- Keyboard and clipboard --------------------------------------------

  /** The selection a navigation key leads to, or null for keys that do not navigate. */
  private navigate(event: KeyboardEvent, selection: Selection, extent: Extent): Selection | null {
    const page = Math.max(1, Math.floor(this.viewportPx() / this.rowHeight()) - 2);
    const jump = event.ctrlKey || event.metaKey;
    const far = Number.MAX_SAFE_INTEGER;
    const steps: Readonly<Record<string, readonly [number, number]>> = {
      ArrowDown: [jump ? far : 1, 0],
      ArrowUp: [jump ? -far : -1, 0],
      ArrowRight: [0, jump ? far : 1],
      ArrowLeft: [0, jump ? -far : -1],
      PageDown: [page, 0],
      PageUp: [-page, 0],
      Home: [jump ? -far : 0, -far],
      End: [jump ? far : 0, far]
    };
    const step = steps[event.key];
    if (step !== undefined) {
      return moveFocus(selection, step[0], step[1], event.shiftKey, extent);
    }
    return event.key === "a" && jump ? selectAll(extent) : null;
  }

  protected onKey(event: KeyboardEvent): void {
    if (this.shortcut(event)) {
      event.preventDefault();
      return;
    }
    const extent = this.extent();
    if (extent.rows === 0) {
      return;
    }
    const start = { row: 0, column: extent.tree ? -1 : 0 };
    const selection = this.selection() ?? { anchor: start, focus: start };
    if (event.key === "Escape") {
      this.selection.set(null);
      event.preventDefault();
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && selection.focus.column === -1) {
      this.toggleRow(selection.focus.row);
      event.preventDefault();
      return;
    }
    const next = this.navigate(event, selection, extent);
    if (next !== null) {
      event.preventDefault();
      this.selection.set(next);
      this.reveal(next.focus);
    }
  }

  /** The selected cells as text, if the frame holds all of them. */
  private rangeText(frame: FrameData, range: CellRange): string | null {
    const firstData = Math.max(0, range.left);
    const holdsRows = range.top >= frame.firstRow && range.bottom < frame.firstRow + frame.rowCount;
    const holdsColumns = range.right < 0 || (firstData >= frame.firstColumn && range.right < frame.firstColumn + frame.columns.length);
    if (!holdsRows || !holdsColumns || (range.left === -1 && frame.tree === null)) {
      return null;
    }
    const rows: string[][] = [];
    for (let row = range.top; row <= range.bottom; row += 1) {
      const local = row - frame.firstRow;
      const cells: string[] = [];
      for (let column = range.left; column <= range.right; column += 1) {
        const tree = frame.tree;
        cells.push(column === -1 ? (tree === null ? "" : groupText(tree, local)) : (frame.columns[column - frame.firstColumn]?.copy(local) ?? ""));
      }
      rows.push(cells);
    }
    return toTsv(rows);
  }

  /** Identifies a copied range in one configuration and load of the view. */
  private copyKey(frame: FrameData, range: CellRange): string {
    return JSON.stringify([frame.configVersion.toString(), frame.loadVersion.toString(), range]);
  }

  protected onCopy(event: ClipboardEvent): void {
    const selection = this.selection();
    const frame = this.source.frame();
    if (selection === null || frame === null) {
      return;
    }
    event.preventDefault();
    const range = rangeOf(selection);
    const rows = range.bottom - range.top + 1;
    const count = `${rows.toLocaleString("en-US")} ${rows === 1 ? "row" : "rows"}`;
    const key = this.copyKey(frame, range);
    const ready = this.prepared?.key === key ? this.prepared.text : this.rangeText(frame, range);
    if (ready !== null) {
      event.clipboardData?.setData("text/plain", ready);
      this.prepared = null;
      this.message.set(`Copied ${count}`);
      return;
    }
    const firstColumn = Math.max(0, range.left);
    this.message.set(`Copying ${count}…`);
    const fetched = this.source.fetch({ firstRow: range.top, rowCount: rows, firstColumn, columnCount: Math.max(1, range.right - firstColumn + 1) }).then((f) => {
      const text = this.rangeText(f, range);
      if (text === null) {
        throw new Error("the rows changed while copying; copy again");
      }
      return { text, key: this.copyKey(f, range) };
    });
    const keep = (): void => {
      // Browsers only let a page write to the clipboard during the user's action,
      // and the rows arrived after it ended: keep them for the next Ctrl+C.
      fetched.then(
        (copy) => {
          this.prepared = copy;
          this.message.set(`${count} ready: press Ctrl+C again to copy them`);
        },
        (failure: unknown) => {
          this.message.set(`Copy failed: ${failure instanceof Error ? failure.message : String(failure)}`);
        }
      );
    };
    if (!window.isSecureContext || typeof ClipboardItem === "undefined") {
      keep();
      return;
    }
    // Started inside the copy event, the write still counts as the user's action;
    // the text follows when the rows arrive.
    const blob = fetched.then((copy) => new Blob([copy.text], { type: "text/plain" }));
    navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]).then(
      () => {
        this.message.set(`Copied ${count}`);
      },
      () => {
        keep();
      }
    );
  }

  // ---- Tooltips ----------------------------------------------------------

  private scheduleTooltip(hit: Hit, x: number, y: number): void {
    this.clearTooltip();
    if (hit.header || hit.row === null || hit.column === null) {
      return;
    }
    const text = this.notes.get(`${String(hit.row)}:${String(hit.column)}`);
    if (text === undefined) {
      return;
    }
    this.tooltipTimer = setTimeout(() => {
      this.tooltip.set({ x: x + 12, y: y + 16, text });
    }, TOOLTIP_DELAY_MS);
  }

  private clearTooltip(): void {
    if (this.tooltipTimer !== null) {
      clearTimeout(this.tooltipTimer);
      this.tooltipTimer = null;
    }
    if (this.tooltip() !== null) {
      this.tooltip.set(null);
    }
  }

  // ---- Drawing -----------------------------------------------------------

  /** Sets the context's font, which `measure` then measures in. */
  private useFont(canvas: CanvasRenderingContext2D, font: string): void {
    const context = canvas;
    context.font = font;
    this.font = font;
  }

  private measure(context: CanvasRenderingContext2D, text: string): number {
    let widths = this.textWidths.get(this.font);
    if (widths === undefined) {
      widths = new Map();
      this.textWidths.set(this.font, widths);
    }
    let width = widths.get(text);
    if (width === undefined) {
      width = context.measureText(text).width;
      if (widths.size > 50_000) {
        widths.clear();
      }
      widths.set(text, width);
    }
    return width;
  }

  private prepare(width: number, height: number): CanvasRenderingContext2D | null {
    const element = this.canvas().nativeElement;
    const context = element.getContext("2d", { alpha: false });
    if (context === null) {
      return null;
    }
    const ratio = window.devicePixelRatio;
    if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      element.style.width = `${String(width)}px`;
      element.style.height = `${String(height)}px`;
      this.shape = "";
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return context;
  }

  private draw(frame: FrameData | null, scrollTop: number, scrollLeft: number, viewportPx: number, widthPx: number): void {
    const started = performance.now();
    const height = Math.max(1, viewportPx);
    const width = Math.max(1, widthPx);
    const context = this.prepare(width, height);
    if (context === null) {
      return;
    }
    const first = this.rows().firstRow(scrollTop, height);
    const pass = this.begin(context, frame, { first, scrollLeft, width, height });
    if (frame !== null) {
      const cells = this.drawRows(pass, frame, first, height);
      this.drawFooter(pass, frame, height);
      const now = performance.now();
      const asked = frame.requestedAtMs;
      const answered = asked !== undefined && asked !== this.timedRequest;
      if (answered) {
        this.timedRequest = asked;
      }
      const latencyMs = answered ? [...this.stats.latencyMs.slice(1 - LATENCIES), now - asked] : this.stats.latencyMs;
      const changed = frame.changedAtMs;
      const answersChange = changed !== undefined && changed !== this.timedChange;
      if (answersChange) {
        this.timedChange = changed;
      }
      const changes = answersChange ? [...this.stats.changes.slice(1 - LATENCIES), { sentAtMs: changed, drawnAtMs: now }] : this.stats.changes;
      // Opening a view clears the frame, so the first frame drawn after it opened holds its first rows.
      const opened = this.source.openedAtMs();
      const firstRows = opened !== null && opened !== this.stats.firstRows?.openedAtMs ? { openedAtMs: opened, drawnAtMs: now } : this.stats.firstRows;
      this.stats = {
        frames: this.stats.frames + 1,
        fullDraws: this.stats.fullDraws,
        cellDraws: this.stats.cellDraws + cells,
        drawMs: this.stats.drawMs + now - started,
        latencyMs,
        firstRows,
        changes
      };
    }
  }

  /** Decides whether this pass redraws everything, and if so clears and draws the header. */
  /** Everything a full redraw depends on, as one comparable string. */
  private shapeOf(frame: FrameData | null, at: Area): string {
    const geometry = this.geometry();
    const layout = this.current();
    const versions = frame === null ? null : [frame.configVersion.toString(), frame.loadVersion.toString(), frame.totalRows, frame.firstColumn];
    const decor = layout === null ? null : [layout.column_widths, layout.sort, layout.group_sort, layout.filters, layout.pinned, this.hoverHeader(), this.menu()?.column, this.drag()];
    return JSON.stringify([at, versions, geometry.treePx, geometry.contentWidth, decor]);
  }

  /** Visible rows the selection covered or now covers, which must be redrawn even if their text is unchanged. */
  private selectionRows(range: CellRange | null, focus: CellRef | null, at: Area): ReadonlySet<number> {
    const rows = new Set<number>();
    const visible = Math.ceil(at.height / this.rowHeight());
    for (let row = at.first; row < at.first + visible; row += 1) {
      const covered = (r: CellRange | null): boolean => r !== null && row >= r.top && row <= r.bottom;
      if (covered(range) || covered(this.drawnRange) || row === focus?.row || row === this.drawnFocus?.row) {
        rows.add(row);
      }
    }
    return rows;
  }

  /**
   * The rows to draw again although their text is unchanged: those the selection covered or now covers, and the row
   * the pointer left and the row it entered.
   */
  private staleRows(range: CellRange | null, focus: CellRef | null, hovered: number | null, at: Area): Set<number> {
    const moved = JSON.stringify([range, focus]) !== JSON.stringify([this.drawnRange, this.drawnFocus]);
    const stale = moved ? new Set(this.selectionRows(range, focus, at)) : new Set<number>();
    this.drawnRange = range;
    this.drawnFocus = focus;
    if (hovered !== this.drawnHover) {
      for (const row of [hovered, this.drawnHover]) {
        if (row !== null) {
          stale.add(row);
        }
      }
      this.drawnHover = hovered;
    }
    return stale;
  }

  /** The search `frame`'s rows matched, the columns it looks in, and whether it looks in the group labels. */
  private searchedBy(frame: FrameData | null, layout: Layout | null): Pick<Pass, "search" | "searched" | "labelsSearched"> {
    const search = frame === null ? "" : this.source.searchOf(frame);
    const searched: ReadonlySet<string> = search === "" || layout === null ? new Set() : new Set(searchColumns(layout, this.fields()));
    return { search, searched, labelsSearched: layout?.group_by.some((g) => searched.has(g)) ?? false };
  }

  private begin(target: CanvasRenderingContext2D, frame: FrameData | null, at: Area): Pass {
    const geometry = this.geometry();
    const selection = this.selection();
    const shape = this.shapeOf(frame, at);
    const range = selection === null ? null : rangeOf(selection);
    const focus = selection?.focus ?? null;
    const hovered = this.hoverRow();
    const stale = this.staleRows(range, focus, hovered, at);
    const theme = this.palette() ?? readTheme(this.canvas().nativeElement);
    const full = theme !== this.tokens || shape !== this.shape;
    this.tokens = theme;
    this.shape = shape;
    const layout = this.current();
    const { search, searched, labelsSearched } = this.searchedBy(frame, layout);
    const metrics = this.metrics();
    this.padding = metrics.padding;
    const rowRule = invisible(theme.rowBorder) ? null : theme.rowBorder;
    const hover = hovered === null || invisible(theme.rowHover) ? null : { row: hovered, color: theme.rowHover };
    const pass: Pass = {
      context: target,
      theme,
      rowPx: metrics.rowPx,
      headerPx: metrics.headerPx,
      rowRule,
      hover,
      detail: layout?.detail ?? false,
      fonts: { body: theme.font, group: `${theme.groupFontWeight} ${theme.font}`, header: `${theme.headerFontWeight} ${theme.font}` },
      full,
      geometry,
      scrollLeft: at.scrollLeft,
      width: at.width,
      range,
      focus,
      stale,
      search,
      searched,
      labelsSearched
    };
    const { context } = pass;
    this.useFont(context, theme.font);
    context.textBaseline = "middle";
    if (full) {
      this.drawn = new Map();
      this.drawnRows = new Set();
      this.notes = new Map();
      context.fillStyle = theme.background;
      context.fillRect(0, 0, at.width, at.height);
      this.drawHeader(pass, frame);
      this.stats = { ...this.stats, fullDraws: this.stats.fullDraws + 1 };
    }
    return pass;
  }

  private drawRows(pass: Pass, frame: FrameData, first: number, height: number): number {
    let cells = 0;
    const visible = Math.ceil((height - pass.headerPx) / pass.rowPx);
    for (let i = 0; i < visible; i += 1) {
      const row = first + i;
      const local = row - frame.firstRow;
      const y = pass.headerPx + pass.rowPx * i;
      if (local >= 0 && local < frame.rowCount) {
        cells += this.drawRow(pass, frame, local, row, y);
        this.drawnRows.add(row);
      } else if (this.drawnRows.delete(row)) {
        // The row no longer has data, such as after a group collapsed: clear it.
        const { context, theme } = pass;
        context.fillStyle = theme.background;
        context.fillRect(0, y, pass.width, pass.rowPx);
      }
    }
    return cells;
  }

  /**
   * Runs `paint` for each data column in view: first the scrolling ones, clipped to the area they scroll in, then the
   * pinned ones over them, clipped beside the group column, with a shadow on their edge once anything is scrolled.
   */
  private eachColumn(pass: Pass, top: number, height: number, paint: (column: number) => void): void {
    const { context, geometry } = pass;
    const clipped = (left: number, right: number, columns: readonly number[]): void => {
      context.save();
      context.beginPath();
      context.rect(left, top, Math.max(0, right - left), height);
      context.clip();
      columns.forEach(paint);
      context.restore();
    };
    clipped(geometry.frozenPx, pass.width, scrolledColumns(geometry, pass.scrollLeft, pass.width));
    if (geometry.pinned > 0) {
      clipped(
        geometry.treePx,
        geometry.frozenPx,
        Array.from({ length: geometry.pinned }, (_, i) => i)
      );
      if (pass.scrollLeft > 0) {
        // A line at the edge; the shadow beside it is an element over the canvas, so redrawn cells never darken it.
        context.fillStyle = pass.theme.borderColor;
        context.fillRect(geometry.frozenPx - 1, top, 1, height);
      }
    }
  }

  private sortMark(column: number): SortMark | null {
    const layout = this.current();
    if (layout === null) {
      return null;
    }
    if (column === -1) {
      return layout.group_sort.by === "key" && layout.group_sort.descending ? { descending: true, priority: null } : null;
    }
    if (isPivot(layout)) {
      const by = layout.group_sort.by;
      return by !== "key" && column % Math.max(1, layout.measures.length) === by.measure ? { descending: layout.group_sort.descending, priority: null } : null;
    }
    const name = this.geometry().widthKey(column);
    const index = layout.sort.findIndex((s) => s.column === name);
    const sort = layout.sort[index];
    if (sort === undefined) {
      return null;
    }
    return { descending: sort.descending, priority: layout.sort.length > 1 ? index + 1 : null };
  }

  /** The room a sort mark takes in a header: its arrow and, after a gap, its priority. */
  private markWidth(context: CanvasRenderingContext2D, mark: SortMark | null): number {
    if (mark === null) {
      return 0;
    }
    const { arrowPx } = untracked(this.metrics);
    return arrowPx + 2 + (mark.priority === null ? 0 : this.measure(context, String(mark.priority)) + 1);
  }

  private drawHeader(pass: Pass, frame: FrameData | null): void {
    const { context, theme, headerPx, geometry } = pass;
    context.fillStyle = theme.headerBackground;
    context.fillRect(0, 0, pass.width, headerPx);
    this.useFont(context, pass.fonts.header);
    const layout = this.current();
    if (geometry.treePx > 0) {
      context.fillStyle = theme.headerForeground;
      const title = layout === null || layout.group_by.length === 0 ? "Group" : layout.group_by.join(" › ");
      this.headerText(pass, title, this.sortMark(-1), 0, geometry.treePx);
      context.fillStyle = theme.columnBorder;
      context.fillRect(geometry.treePx - 1, 0, 1, headerPx);
    }
    this.eachColumn(pass, 0, headerPx, (column) => {
      this.drawColumnHeader(pass, frame, layout, column);
    });
    this.useFont(context, pass.fonts.body);
    const drag = this.drag();
    if (drag !== null && geometry.count > 0) {
      const at = Math.min(drag.before, geometry.count);
      const x = at < geometry.count ? screenX(geometry, at, pass.scrollLeft) : screenX(geometry, at - 1, pass.scrollLeft) + geometry.width(at - 1);
      context.fillStyle = theme.accent;
      context.fillRect(x - 1, 0, 3, headerPx);
    }
    context.fillStyle = theme.headerBorder;
    context.fillRect(0, headerPx - 1, pass.width, 1);
  }

  /** Draws data column `column`'s header: its title, sort mark, and for a column with a menu, its funnel and pin. */
  private drawColumnHeader(pass: Pass, frame: FrameData | null, layout: Layout | null, column: number): void {
    const { context, theme, headerPx, geometry } = pass;
    const x = screenX(geometry, column, pass.scrollLeft);
    const width = geometry.width(column);
    const title = (frame === null ? undefined : frame.columns[column - frame.firstColumn])?.title ?? "";
    const look = this.headerLook(column, layout);
    const open = column === this.menu()?.column;
    const lit = open || column === this.hoverHeader() || column === this.drag()?.from;
    if (lit) {
      context.fillStyle = theme.controlHover;
      context.fillRect(x, 0, width, headerPx);
    }
    context.fillStyle = theme.headerForeground;
    if (look === null) {
      this.headerText(pass, title, this.sortMark(column), x, width);
    } else {
      this.drawMenuHeader(pass, column, { x, width, title }, look, open || lit ? (open ? "open" : "lit") : "rest");
    }
    context.fillStyle = theme.columnBorder;
    context.fillRect(x + width - 1, 0, 1, headerPx);
  }

  /** How a header with a menu shows its column's state: filtered, pinned, and the mark that opens it; null without a menu. */
  private headerLook(column: number, layout: Layout | null): { readonly filtered: boolean; readonly pinned: boolean; readonly mark: string } | null {
    const name = this.menuColumn(column);
    if (layout === null) {
      return null;
    }
    if (name !== null) {
      return { filtered: isFiltered(layout, name), pinned: layout.pinned.includes(name), mark: FUNNEL_PATH };
    }
    return this.menuMeasure(column) === null ? null : { filtered: false, pinned: false, mark: CHEVRON_PATH };
  }

  /** Draws the header of a column with a menu: a pin mark if pinned, the title and sort mark, and the menu's mark. */
  private drawMenuHeader(
    pass: Pass,
    column: number,
    at: { readonly x: number; readonly width: number; readonly title: string },
    look: { readonly filtered: boolean; readonly pinned: boolean; readonly mark: string },
    state: "open" | "lit" | "rest"
  ): void {
    const { filtered, pinned } = look;
    const { context, theme, headerPx } = pass;
    const { iconPx, funnelPx, padding } = this.metrics();
    const indent = pinned ? iconPx + 2 : 0;
    const top = headerPx / 2 - iconPx / 2;
    if (pinned) {
      this.icon(context, PIN_PATH, at.x + padding - 2, top, iconPx, theme.muted, false);
    }
    context.fillStyle = theme.headerForeground;
    this.headerText(pass, at.title, this.sortMark(column), at.x + indent, at.width - indent - funnelPx + padding);
    const color = filtered || state === "open" ? theme.accent : state === "lit" ? theme.headerForeground : theme.muted;
    this.icon(context, look.mark, at.x + at.width - funnelPx, top, iconPx, color, filtered, filtered || state !== "rest" ? 1 : RESTING_FUNNEL);
  }

  /** Draws an icon's path, `size` pixels square, with its top left at `x`, `y`, at `alpha` strength. */
  private icon(canvas: CanvasRenderingContext2D, path: string, x: number, y: number, size: number, color: string, filled: boolean, alpha = 1): void {
    const context = canvas;
    context.save();
    context.globalAlpha = alpha;
    context.translate(x, y);
    context.scale(size / 16, size / 16);
    const shape = new Path2D(path);
    context.lineWidth = 1.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = color;
    if (filled) {
      context.fillStyle = color;
      context.fill(shape);
    }
    context.stroke(shape);
    context.restore();
  }

  /** Draws a header's title, cut to leave room for its sort mark, then the mark: an arrow in the accent and its priority. */
  private headerText(pass: Pass, title: string, mark: SortMark | null, x: number, width: number): void {
    const { context, headerPx, theme } = pass;
    const markWidth = this.markWidth(context, mark);
    this.clipText(context, title, x, width - markWidth, headerPx / 2, false);
    if (mark === null) {
      return;
    }
    const { arrowPx } = this.metrics();
    const left = x + width - this.padding - markWidth + 2;
    this.icon(context, mark.descending ? DOWN_PATH : UP_PATH, left, headerPx / 2 - arrowPx / 2, arrowPx, theme.accent, false);
    if (mark.priority !== null) {
      const ink = context.fillStyle;
      context.fillStyle = theme.accent;
      context.fillText(String(mark.priority), left + arrowPx + 1, headerPx / 2);
      context.fillStyle = ink;
    }
  }

  /** Draws the totals row along the bottom, over the rows: the engine's text for each column with a total. */
  private drawFooter(pass: Pass, frame: FrameData, height: number): void {
    const totals = frame.totals;
    if (totals === null) {
      return;
    }
    const { context, theme, rowPx, geometry } = pass;
    const y = height - rowPx;
    context.fillStyle = theme.totalBackground;
    context.fillRect(0, y, pass.width, rowPx);
    this.useFont(context, `${theme.totalFontWeight} ${theme.font}`);
    if (geometry.treePx > 0) {
      context.fillStyle = theme.foreground;
      this.clipText(context, "Total", 0, geometry.treePx, y + rowPx / 2, false);
    }
    this.eachColumn(pass, y, rowPx, (column) => {
      const data = totals[column - frame.firstColumn];
      const x = screenX(geometry, column, pass.scrollLeft);
      const text = data?.text(0) ?? "";
      // A grid without a group column says which row this is in its first column, unless that has a total.
      const shown = text === "" && column === 0 && geometry.treePx === 0 ? "Total" : text;
      context.fillStyle = data !== undefined && data.flag(0) !== CellFlag.Ok ? theme.muted : data?.numeric === true && isNegativeText(text) ? theme.negative : theme.foreground;
      this.clipText(context, shown, x, geometry.width(column), y + rowPx / 2, data?.numeric === true && text !== "");
    });
    this.useFont(context, theme.font);
    context.fillStyle = theme.totalBorder;
    context.fillRect(0, y, pass.width, 1);
  }

  private drawRow(pass: Pass, frame: FrameData, local: number, row: number, y: number): number {
    // A group's row, and a pivot's grand total, stand out in the group font; a grouped grid's groups have their own
    // background too, to set them off from the rows under them.
    const kind = frame.tree?.kind(local) ?? null;
    const strong = kind === "group" || kind === "total";
    const stripe = kind === "group" && pass.detail ? pass.theme.groupBackground : row % 2 === 0 ? pass.theme.background : pass.theme.stripe;
    if (strong) {
      this.useFont(pass.context, pass.fonts.group);
    }
    let cells = frame.tree === null ? 0 : this.drawTreeCell(pass, frame.tree, local, row, y, stripe);
    this.eachColumn(pass, y, pass.rowPx, (column) => {
      if (this.drawCell(pass, frame, column, local, row, y, stripe)) {
        cells += 1;
      }
    });
    if (strong) {
      this.useFont(pass.context, pass.fonts.body);
    }
    return cells;
  }

  /** Fills a cell's background, highlighting it if its row is under the pointer and marking it if it is selected. */
  private cellBackground(pass: Pass, row: number, column: number, x: number, y: number, width: number, stripe: string): void {
    const { context, theme, rowPx, range, focus, hover } = pass;
    const fill = hover?.row === row ? hover.color : stripe;
    if (fill !== theme.background && translucent(fill)) {
      context.fillStyle = theme.background;
      context.fillRect(x, y, width, rowPx);
    }
    context.fillStyle = fill;
    context.fillRect(x, y, width, rowPx);
    if (range !== null && contains(range, row, column)) {
      context.fillStyle = theme.selectionBackground;
      context.fillRect(x, y, width, rowPx);
    }
    if (focus !== null && focus.row === row && focus.column === column) {
      context.strokeStyle = theme.selectionBorder;
      context.lineWidth = 2;
      context.beginPath();
      context.roundRect(x + 1, y + 1, width - 3, rowPx - 3, 2);
      context.stroke();
    }
  }

  private drawTreeCell(pass: Pass, tree: TreeRows, local: number, row: number, y: number, stripe: string): number {
    const depth = tree.depth(local);
    const expanded = tree.expanded(local);
    const label = groupText(tree, local);
    // What the cell shows, to tell when it changes: the marker's state and the label.
    const text = `${expanded === null ? " " : expanded ? "-" : "+"}${label}`;
    const key = `${String(row)}:-1`;
    if (!pass.full && !pass.stale.has(row) && this.drawn.get(key) === text) {
      return 0;
    }
    const { context, theme, rowPx, geometry } = pass;
    this.cellBackground(pass, row, -1, 0, y, geometry.treePx, stripe);
    const { padding, indent, iconPx, markerPx } = this.metrics();
    const left = padding + depth * indent;
    if (expanded !== null) {
      this.icon(context, expanded ? OPEN_PATH : CLOSED_PATH, left - 2, y + rowPx / 2 - iconPx / 2, iconPx, theme.muted, false);
    }
    context.fillStyle = tree.kind(local) === "total" ? theme.totalForeground : theme.foreground;
    const marks = pass.labelsSearched ? highlightRanges(tree.label(local), pass.search) : NO_MARKS;
    const start = left + markerPx;
    if (this.clipText(context, label, start - padding, geometry.treePx - start + padding, y + rowPx / 2, false, marks, theme.highlight)) {
      this.notes.set(key, label);
    }
    this.rowRule(pass, 0, y, geometry.treePx);
    context.fillStyle = theme.columnBorder;
    context.fillRect(geometry.treePx - 1, y, 1, rowPx);
    this.drawn.set(key, text);
    return 1;
  }

  private drawCell(pass: Pass, frame: FrameData, column: number, local: number, row: number, y: number, stripe: string): boolean {
    const data = frame.columns[column - frame.firstColumn];
    if (data === undefined) {
      return false;
    }
    const text = data.text(local);
    const key = `${String(row)}:${String(column)}`;
    if (!pass.full && !pass.stale.has(row) && this.drawn.get(key) === text) {
      return false;
    }
    const { context, theme, rowPx, geometry } = pass;
    const x = screenX(geometry, column, pass.scrollLeft);
    const width = geometry.width(column);
    this.cellBackground(pass, row, column, x, y, width, stripe);
    const flag = data.flag(local);
    const style = cellStyle(pass, data, frame.tree?.kind(local) ?? null, text, flag);
    context.fillStyle = style.color;
    const clipped = this.clipText(context, text, x, width, y + rowPx / 2, style.right, style.marks, theme.highlight);
    this.noteCell(key, FLAG_NOTES[flag] ?? (clipped ? text : null));
    this.rowRule(pass, x, y, width);
    context.fillStyle = theme.columnBorder;
    context.fillRect(x + width - 1, y, 1, rowPx);
    this.drawn.set(key, text);
    return true;
  }

  /** Draws the line under a cell of the row at `y`, if the theme has one. */
  private rowRule(pass: Pass, x: number, y: number, width: number): void {
    const { context, rowRule, rowPx } = pass;
    if (rowRule !== null) {
      context.fillStyle = rowRule;
      context.fillRect(x, y + rowPx - 1, width, 1);
    }
  }

  /** Keeps what a cell's tooltip says, or forgets it when null. */
  private noteCell(key: string, note: string | null): void {
    if (note === null) {
      this.notes.delete(key);
    } else {
      this.notes.set(key, note);
    }
  }

  /**
   * Draws text within a cell, behind `marks` (ranges of the text, as a search's matches) in `markColor`; returns
   * `true` if it did not fit and was cut or replaced by `###`.
   */
  private clipText(context: CanvasRenderingContext2D, text: string, x: number, width: number, y: number, numeric: boolean, marks = NO_MARKS, markColor = ""): boolean {
    const padding = this.padding;
    const room = width - 2 * padding;
    const measured = this.measure(context, text);
    if (numeric) {
      const fits = measured <= room;
      const shown = fits ? text : "###";
      const w = fits ? measured : this.measure(context, shown);
      context.fillText(shown, x + width - padding - w, y);
      return !fits;
    }
    const fits = measured <= room;
    let cut = text.length;
    while (!fits && cut > 0 && this.measure(context, `${text.slice(0, cut)}…`) > room) {
      cut -= 1;
    }
    this.mark(context, text, cut, x + padding, y, marks, markColor);
    context.fillText(fits ? text : `${text.slice(0, cut)}…`, x + padding, y);
    return !fits;
  }

  /** Fills behind each range of `marks` within the first `shown` characters of `text`, drawn from `left`. */
  private mark(canvas: CanvasRenderingContext2D, text: string, shown: number, left: number, y: number, marks: readonly (readonly [number, number])[], color: string): void {
    if (marks.length === 0) {
      return;
    }
    const context = canvas;
    const ink = context.fillStyle;
    context.fillStyle = color;
    const height = this.rowHeight() - 6;
    for (const [start, end] of marks) {
      if (start >= shown) {
        break;
      }
      const from = left + this.measure(context, text.slice(0, start));
      const to = left + this.measure(context, text.slice(0, Math.min(end, shown)));
      context.fillRect(from, y - height / 2, to - from, height);
    }
    context.fillStyle = ink;
  }
}
