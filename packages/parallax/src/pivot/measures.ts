/* Edits to a pivot's measures, as pure functions. Sorts, filters on measures, top-N and widths name a measure by its
 * position, so removing or moving one renumbers them: removing a measure drops what named it, and moving one carries
 * its sort, filters and width with it. */

import { measureOfWidthKey, measureWidthKey } from "#layout/layout.ts";
import type { Layout, LayoutFormat, LayoutMeasure } from "#layout/layout.ts";

type Aggregate = LayoutMeasure["aggregate"];

/** Where each old position went: the new position, or null for a measure removed. */
type Renumbering = (old: number) => number | null;

/** The percentile a new percentile measure takes: the median. */
const defaultPercentile = 0.5;

/** A measure with every field at its default. */
function measure(aggregate: Aggregate, column: string | null): LayoutMeasure {
  return {
    aggregate,
    column,
    format: null,
    percentile: aggregate === "percentile" ? defaultPercentile : null,
    show_as: "value",
    unit_column: null,
    weight: null,
  };
}

/** Moves the item at `index` by `delta` places, or leaves the list as it is when it would leave the list. */
function moved<TItem>(items: readonly TItem[], index: number, delta: number): readonly TItem[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return items;
  }
  const out = [...items];
  const [item] = out.splice(index, 1);
  if (item !== undefined) {
    out.splice(target, 0, item);
  }
  return out;
}

/** The groups' sort after renumbering: by key when its measure went, keeping a sort by key as it was. */
function renumberedSort(layout: Layout, at: Renumbering): Layout["group_sort"] {
  const { by, descending } = layout.group_sort;
  const sortedBy = by === "key" ? null : at(by.measure);
  if (sortedBy === null) {
    return { by: "key", descending: by === "key" ? descending : false };
  }
  return { by: { measure: sortedBy }, descending };
}

/** The column widths after renumbering: a removed measure's width goes, and the others move with their measures. */
function renumberedWidths(layout: Layout, at: Renumbering): Layout["column_widths"] {
  const widths: Record<string, number> = {};
  for (const [key, width] of Object.entries(layout.column_widths)) {
    const old = measureOfWidthKey(key);
    const now = old === null ? null : at(old);
    if (old === null) {
      widths[key] = width;
    } else if (now !== null) {
      widths[measureWidthKey(now)] = width;
    }
  }
  return widths;
}

/** The layout with `measures`, after reordering or removing: `from[old]` is each old measure's new position. */
function renumber(
  layout: Layout,
  measures: readonly LayoutMeasure[],
  from: readonly (number | null)[],
): Layout {
  const at: Renumbering = (old) => from[old] ?? null;
  const topMeasure = layout.top_n === null ? null : at(layout.top_n.measure);
  return {
    ...layout,
    column_widths: renumberedWidths(layout, at),
    group_sort: renumberedSort(layout, at),
    having: layout.having.flatMap((having) => {
      const now = at(having.measure);
      return now === null ? [] : [{ ...having, measure: now }];
    }),
    measures: [...measures],
    top_n:
      layout.top_n === null || topMeasure === null
        ? null
        : { ...layout.top_n, measure: topMeasure },
  };
}

/** Adds a measure at the end. */
function addMeasure(layout: Layout, added: LayoutMeasure): Layout {
  return { ...layout, measures: [...layout.measures, added] };
}

/** Removes the measure at `index`, with the sorts, filters and widths that named it. */
function removeMeasure(layout: Layout, index: number): Layout {
  const from = layout.measures.map((_measure, old) => {
    if (old === index) {
      return null;
    }
    return old < index ? old : old - 1;
  });
  return renumber(
    layout,
    layout.measures.filter((_measure, old) => old !== index),
    from,
  );
}

/** Moves the measure at `index` up (`-1`) or down (`1`), or by more places. */
function moveMeasure(layout: Layout, index: number, delta: number): Layout {
  const order = moved(
    layout.measures.map((_measure, old) => old),
    index,
    delta,
  );
  if (order.every((old, now) => old === now)) {
    return layout;
  }
  const from = layout.measures.map((_measure, old) => order.indexOf(old));
  const measures = order.flatMap((old) => {
    const kept = layout.measures[old];
    return kept === undefined ? [] : [kept];
  });
  return renumber(layout, measures, from);
}

/** Replaces fields of the measure at `index`. */
function updateMeasure(layout: Layout, index: number, patch: Partial<LayoutMeasure>): Layout {
  return {
    ...layout,
    measures: layout.measures.map((kept, at) => (at === index ? { ...kept, ...patch } : kept)),
  };
}

/** A format with every part at its default, which shows a measure as its column does. */
const plainFormat: LayoutFormat = {
  abbreviate: null,
  decimals: null,
  negative: "minus",
  percent: false,
  precision: "seconds",
  thousands: null,
  zone: null,
};

/** A format's parts. */
const formatParts = [
  "abbreviate",
  "decimals",
  "negative",
  "percent",
  "precision",
  "thousands",
  "zone",
] as const satisfies readonly (keyof LayoutFormat)[];

/** Whether a format is the plain one in every part. */
function isPlain(format: LayoutFormat): boolean {
  return formatParts.every((part) => format[part] === plainFormat[part]);
}

/** Changes parts of a measure's display format; with every part back at its default, the measure has none. */
function withMeasureFormat(layout: Layout, index: number, patch: Partial<LayoutFormat>): Layout {
  const current = layout.measures[index];
  if (current === undefined) {
    return layout;
  }
  const format: LayoutFormat = { ...(current.format ?? plainFormat), ...patch };
  return updateMeasure(layout, index, { format: isPlain(format) ? null : format });
}

/** Sorts a pivot's groups by measure `index`, largest first when descending, or by their keys again for null. */
function withMeasureSort(layout: Layout, index: number, descending: boolean | null): Layout {
  return {
    ...layout,
    group_sort:
      descending === null
        ? { by: "key", descending: false }
        : { by: { measure: index }, descending },
  };
}

/** Whether a pivot's groups are sorted by measure `index`: largest first, smallest first, or not by it. */
function measureSort(layout: Layout, index: number): "descending" | "ascending" | null {
  const { by, descending } = layout.group_sort;
  if (by === "key" || by.measure !== index) {
    return null;
  }
  return descending ? "descending" : "ascending";
}

export {
  addMeasure,
  defaultPercentile,
  measure,
  measureSort,
  moved,
  moveMeasure,
  removeMeasure,
  updateMeasure,
  withMeasureFormat,
  withMeasureSort,
};
