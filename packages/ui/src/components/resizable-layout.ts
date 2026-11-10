/* Resizable's layout arithmetic, kept apart from its components so it holds no React and each step stays small.
 * Sizes are percentages of the group, as numbers from 0 to 100. */

type Orientation = "horizontal" | "vertical";

/** When a pointer drag resizes the panels: `drag` as the pointer moves, `release` once, when it lets go, with only the
 * handle's line following the pointer until then, for a pane that holds a canvas, such as a grid or a chart, which
 * would otherwise lay out and redraw on every move. */
type ResizeOn = "drag" | "release";

/** A group's layout: each panel's size, in percent of the group, by the panel's `id`. */
type ResizableLayout = Readonly<Record<string, number>>;

interface PanelEntry {
  readonly kind: "panel";
  readonly id: string;
  readonly element: HTMLElement;
  readonly defaultSize: number | undefined;
  readonly minSize: number;
  readonly maxSize: number;
}

interface HandleEntry {
  readonly kind: "handle";
  readonly id: string;
  readonly element: HTMLElement;
}

type Entry = PanelEntry | HandleEntry;

interface GroupState {
  /** The group's panels and handles in their DOM order. */
  readonly entries: readonly Entry[];
  /** The sizes the user or `defaultLayout` set; a panel missing from it takes its default. */
  readonly layout: ResizableLayout;
}

type GroupAction =
  | { readonly type: "add"; readonly entry: Entry }
  | { readonly type: "remove"; readonly id: string }
  | { readonly type: "set"; readonly layout: ResizableLayout };

/** The two panels a handle resizes, the one before it first. */
interface Pair {
  readonly before: PanelEntry;
  readonly after: PanelEntry;
}

/** A handle's value, the size of the panel before it, and the range both panels' limits allow that size. */
interface HandleRange {
  readonly now: number;
  readonly min: number;
  readonly max: number;
}

const whole = 100;
/** How far an arrow key moves a handle, in percentage points. */
const keyboardStep = 5;
/** Sizes closer than this, in percentage points, count as equal. */
const tolerance = 1e-6;

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper);
}

function panelsOf(entries: readonly Entry[]): readonly PanelEntry[] {
  return entries.filter((entry) => entry.kind === "panel");
}

/** An entry's place among its siblings. Panels and handles are the group element's direct children. */
function placeOf(entry: Entry): number {
  const parent = entry.element.parentElement;
  return parent === null ? -1 : [...parent.children].indexOf(entry.element);
}

function reduceGroup(state: GroupState, action: GroupAction): GroupState {
  switch (action.type) {
    case "add": {
      const others = state.entries.filter((entry) => entry.id !== action.entry.id);
      const entries = [...others, action.entry].toSorted(
        (first, second) => placeOf(first) - placeOf(second),
      );
      return { ...state, entries };
    }
    case "remove": {
      const entries = state.entries.filter((entry) => entry.id !== action.id);
      return entries.length === state.entries.length ? state : { ...state, entries };
    }
    case "set": {
      return { ...state, layout: action.layout };
    }
    default: {
      return state;
    }
  }
}

/** Each panel's size before its limits: the layout's, else its default, else an equal share of what the rest leave. */
function askedSizes(panels: readonly PanelEntry[], layout: ResizableLayout): readonly number[] {
  const asked = panels.map((panel) => layout[panel.id] ?? panel.defaultSize);
  let assigned = 0;
  let unassigned = 0;
  for (const size of asked) {
    assigned += size ?? 0;
    unassigned += size === undefined ? 1 : 0;
  }
  const share = unassigned === 0 ? 0 : Math.max(0, whole - assigned) / unassigned;
  return asked.map((size) => size ?? share);
}

/** Holds each size to its panel's limits, then moves sizes, the last panel's first, until they sum to 100. */
function settle(panels: readonly PanelEntry[], sizes: readonly number[]): readonly number[] {
  const settled = panels.map((panel, index) =>
    clamp(sizes[index] ?? 0, panel.minSize, panel.maxSize),
  );
  let remaining = whole - settled.reduce((sum, size) => sum + size, 0);
  for (const [index, panel] of [...panels.entries()].toReversed()) {
    const size = settled[index] ?? 0;
    const limit = remaining > 0 ? panel.maxSize : panel.minSize;
    const moved =
      remaining > 0 ? Math.min(remaining, limit - size) : Math.max(remaining, limit - size);
    settled[index] = size + moved;
    remaining -= moved;
  }
  return settled;
}

/** Every panel's size, resolved from the layout, the defaults and the limits, summing to 100 where the limits let
 * them. */
function resolveLayout(panels: readonly PanelEntry[], layout: ResizableLayout): ResizableLayout {
  const sizes = settle(panels, askedSizes(panels, layout));
  return Object.fromEntries(panels.map((panel, index) => [panel.id, sizes[index] ?? 0]));
}

function pairOf(entries: readonly Entry[], handleId: string): Pair | null {
  const index = entries.findIndex((entry) => entry.id === handleId);
  const before = panelsOf(entries.slice(0, Math.max(index, 0))).at(-1);
  const after = panelsOf(entries.slice(index + 1)).at(0);
  return index === -1 || before === undefined || after === undefined ? null : { after, before };
}

function rangeOf(pair: Pair, sizes: ResizableLayout): HandleRange {
  const now = sizes[pair.before.id] ?? 0;
  const total = now + (sizes[pair.after.id] ?? 0);
  const min = Math.max(pair.before.minSize, total - pair.after.maxSize);
  const max = Math.max(min, Math.min(pair.before.maxSize, total - pair.after.minSize));
  return { max, min, now };
}

/** `sizes` with the handle's primary pane moved to `target`, as far as its range allows, and the pane after it
 * taking the rest. */
function resize(sizes: ResizableLayout, pair: Pair, target: number): ResizableLayout {
  const { min, max, now } = rangeOf(pair, sizes);
  const total = now + (sizes[pair.after.id] ?? 0);
  const size = clamp(target, min, max);
  if (Math.abs(size - now) <= tolerance) {
    return sizes;
  }
  return { ...sizes, [pair.before.id]: size, [pair.after.id]: total - size };
}

export { keyboardStep, pairOf, panelsOf, rangeOf, reduceGroup, resize, resolveLayout, whole };
export type {
  Entry,
  GroupAction,
  GroupState,
  HandleEntry,
  HandleRange,
  Orientation,
  Pair,
  PanelEntry,
  ResizableLayout,
  ResizeOn,
};
