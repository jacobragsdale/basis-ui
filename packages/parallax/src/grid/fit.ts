/* Column widths fitted to their values. A column the user has not sized fits its header and its values: every row of
 * a small view, else the first rows loaded. Widths only grow, so a column never narrows under the pointer, up to a
 * limit past which a column is cut and can be widened by hand. */

import type { FrameColumn } from "#frame/columns.ts";
import type { FrameData } from "#frame/frame.ts";
import type { TreeRows } from "#frame/tree.ts";
import { measureWidthKey } from "#layout/layout.ts";
import type { Layout } from "#layout/layout.ts";
import type { Theme } from "#theme/read.ts";

import { isPivotLayout } from "./edit.ts";
import { defaultTreeWidth, defaultWidth, minWidth } from "./geometry.ts";
import type { Metrics } from "./paint/metrics.ts";
import { groupText } from "./paint/scene.ts";
import type { TextWidths } from "./paint/text.ts";

/** The widest a column is fitted to its values; wider ones are cut, and can be widened by hand. */
const maxFitted = 320;
/** The room a sort arrow keeps beside a title. */
const arrowGap = 2;
/** A pin's gap after it. */
const pinGap = 2;

type Widths = Readonly<Record<string, number>>;

/** What fitting measures with: the canvas's context and its text widths, the tokens and the sizes they give. */
interface Ruler {
  readonly context: CanvasRenderingContext2D;
  readonly widths: TextWidths;
  readonly theme: Theme;
  readonly metrics: Metrics;
}

/** A cell's text, or a width already measured, for a frame row. */
type Text = (local: number) => number | string;

/** Widens each of `widest` to its text's width in the font set, where that is wider. */
function widen(ruler: Ruler, widest: number[], shown: readonly (number | string)[]): void {
  const into = widest;
  for (const [index, text] of shown.entries()) {
    const width = typeof text === "number" ? text : ruler.widths.measure(ruler.context, text);
    into[index] = Math.max(into[index] ?? 0, width);
  }
}

/**
 * For each of `texts`, the widest of the first `rows` texts it gives, each measured in the font its row draws in: a
 * group's row and a grand total in the group font, the rest in the body's. Each font is set once for every column.
 */
function widestTexts(
  ruler: Ruler,
  { rows, tree }: { readonly rows: number; readonly tree: TreeRows | null },
  texts: readonly Text[],
): number[] {
  const { context, widths, theme } = ruler;
  const widest = texts.map(() => 0);
  for (const strong of tree === null ? [false] : [false, true]) {
    widths.use(context, strong ? `${theme.groupFontWeight} ${theme.font}` : theme.font);
    for (let local = 0; local < rows; local += 1) {
      const kind = tree?.kind(local) ?? null;
      if ((kind === "group" || kind === "total") === strong) {
        widen(
          ruler,
          widest,
          texts.map((text) => text(local)),
        );
      }
    }
  }
  widths.use(context, theme.font);
  return widest;
}

/**
 * The widths that show each column's first `rows` values and its title with room for its marks, up to a limit; a
 * title has a pin before it if its column is in `pinned`. A pivot's titles name the pivot values and the measure, and
 * would make every column wide, so its columns, whose `pinned` is null, fit their values and are never narrower than
 * the default. Every title is measured in one font and every value in one or two, since setting a font is slow.
 */
function fittedWidths(
  ruler: Ruler,
  columns: readonly FrameColumn[],
  view: {
    readonly rows: number;
    readonly tree: TreeRows | null;
    readonly pinned: readonly string[] | null;
  },
): readonly number[] {
  const { context, widths, theme, metrics } = ruler;
  const { padding, funnelPx, iconPx, arrowPx } = metrics;
  widths.use(context, `${theme.headerFontWeight} ${theme.font}`);
  const { pinned } = view;
  const titles = columns.map((data) => {
    if (pinned === null) {
      return defaultWidth - 2 * padding - 2;
    }
    const pin = pinned.includes(data.name) ? iconPx + pinGap : 0;
    return widths.measure(context, data.title) + arrowPx + arrowGap + funnelPx + pin;
  });
  const values = widestTexts(
    ruler,
    view,
    columns.map(
      (data) =>
        (local: number): string =>
          data.text(local),
    ),
  );
  return columns.map((_column, index) => {
    const widest = Math.max(titles[index] ?? 0, values[index] ?? 0);
    return Math.min(maxFitted, Math.max(minWidth, Math.ceil(widest + 2 * padding + 2)));
  });
}

/** The width that shows the group column's every loaded label, with its marker and indent. */
function treeWidth(ruler: Ruler, frame: FrameData, tree: TreeRows): number {
  const { context, widths, metrics } = ruler;
  const label = (local: number): number =>
    tree.depth(local) * metrics.indent +
    metrics.markerPx +
    widths.measure(context, groupText(tree, local));
  const [widest = 0] = widestTexts(ruler, { rows: frame.rowCount, tree }, [label]);
  return Math.max(defaultTreeWidth / 2, widest + 2 * metrics.padding);
}

/** The width of a header's title in the header's font, with room for an unsorted mark. */
function titleWidth(ruler: Ruler, title: string): number {
  const { context, widths, theme, metrics } = ruler;
  widths.use(context, `${theme.headerFontWeight} ${theme.font}`);
  const width = widths.measure(context, title) + metrics.arrowPx + arrowGap;
  widths.use(context, theme.font);
  return width;
}

/** The width that shows the header and every loaded value of data column `column`, -1 for the group column, or
 * null when the frame does not hold it. */
function widthToFit(ruler: Ruler, frame: FrameData, column: number): number | null {
  const { tree } = frame;
  if (column === -1) {
    return tree === null ? null : treeWidth(ruler, frame, tree);
  }
  const data = frame.columns[column - frame.firstColumn];
  if (data === undefined) {
    return null;
  }
  const [values = 0] = widestTexts(ruler, { rows: frame.rowCount, tree }, [
    (local): string => data.text(local),
  ]);
  return Math.max(titleWidth(ruler, data.title), values) + 2 * ruler.metrics.padding + 2;
}

/** The widths fitted to a view's loaded values, and how many rows each was measured over. */
class ColumnFitter {
  #fitted: Widths = {};
  #over = new Map<string, number>();

  /** The widths fitted so far, by `column_widths` key. */
  public get fitted(): Widths {
    return this.#fitted;
  }

  /** Forgets every fitted width, as when the view closes or the font changes. Returns whether any was kept. */
  public reset(): boolean {
    const had = this.#over.size > 0;
    this.#over = new Map();
    this.#fitted = {};
    return had;
  }

  /**
   * Fits the columns of `frame` the user has not sized to their header and values. A column is measured on the first
   * frame of a view, and again on a frame that holds more of the whole view. Returns whether any width grew.
   */
  public fit(ruler: Ruler, frame: FrameData, layout: Layout): boolean {
    const whole = frame.firstRow === 0 && frame.rowCount >= frame.totalRows;
    // A pivot's columns are fitted by measure: every column of one measure shares a width.
    const pivot = isPivotLayout(layout);
    const period = Math.max(1, layout.measures.length);
    const keyed = frame.columns.map((data, index) => ({
      data,
      key: pivot ? measureWidthKey((frame.firstColumn + index) % period) : data.name,
    }));
    const fitting = keyed.filter(({ key }) =>
      this.#due(layout, key, { rows: frame.rowCount, whole }),
    );
    const view = { pinned: pivot ? null : layout.pinned, rows: frame.rowCount, tree: frame.tree };
    const widths = fittedWidths(
      ruler,
      fitting.map(({ data }) => data),
      view,
    );
    for (const { key } of fitting) {
      this.#over.set(key, frame.rowCount);
    }
    return this.#grow(fitting.map(({ key }, index) => [key, widths[index] ?? 0] as const));
  }

  /** Widens each column to its new width where that is wider. Returns whether any grew. */
  #grow(measured: readonly (readonly [string, number])[]): boolean {
    const wider = measured.filter(([key, width]) => width > (this.#fitted[key] ?? 0));
    if (wider.length === 0) {
      return false;
    }
    const fitted: Record<string, number> = { ...this.#fitted };
    for (const [key, width] of wider) {
      fitted[key] = Math.max(fitted[key] ?? 0, width);
    }
    this.#fitted = fitted;
    return true;
  }

  /**
   * Whether column `key` should be fitted to a frame of `rows` rows: never once the user sized it; otherwise when it
   * was never measured, or the frame holds more of the whole view than the last measurement did.
   */
  #due(
    layout: Layout,
    key: string,
    { rows, whole }: { readonly rows: number; readonly whole: boolean },
  ): boolean {
    if (layout.column_widths[key] !== undefined) {
      return false;
    }
    const over = this.#over.get(key);
    return over === undefined || (whole && over < rows);
  }
}

export { ColumnFitter, widthToFit };
export type { Ruler };
