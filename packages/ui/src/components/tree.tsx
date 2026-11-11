/* Tree: a hierarchy to choose from, such as books under desks or strategies under funds, on the WAI-ARIA tree view
 * pattern. Its rows are treeitems, each at its level, a branch with a chevron that shows whether it is expanded and the
 * chosen row selected. The focus is one row, the only one Tab reaches: Up and Down move a row, Home and End to the ends,
 * Right expands a branch or moves into it, Left collapses it or moves to its parent, and Enter or Space chooses. */

import { cn } from "cn";
import { useId, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { flushSync } from "react-dom";

import { moveFor, pathTo, visibleRows } from "./tree-model.ts";
import { Row } from "./tree-row.tsx";
import type { TreeMove, TreeNode, TreeRow } from "./tree-model.ts";

interface TreeProps<TValue extends string> {
  /** The tree's roots, each with its children. */
  readonly nodes: readonly TreeNode<TValue>[];
  /** The node chosen, or `null` for none, when the app controls it. */
  readonly value?: TValue | null | undefined;
  /** The node an uncontrolled tree starts with; none unless set. */
  readonly defaultValue?: TValue | null | undefined;
  /** Called with the node's value each time one is chosen. */
  readonly onValueChange?: ((value: TValue) => void) | undefined;
  /** The branches expanded at first; the path to the chosen node unless set. */
  readonly defaultExpanded?: readonly TValue[] | undefined;
  /** Which nodes can be chosen: any, the default, or only leaves, whose branches Enter expands instead. */
  readonly selectable?: "any" | "leaves" | undefined;
  /** The tree's name, such as "Books". */
  readonly "aria-label": string;
  /** The tree's id. */
  readonly id?: string | undefined;
  /** Places the tree, as with `max-h-80`; its look is fixed. */
  readonly className?: string | undefined;
}

/** The branches expanded: at first `defaultExpanded`, or the path to the chosen node; and one changed. */
function useExpanded<TValue extends string>(
  nodes: readonly TreeNode<TValue>[],
  chosen: TValue | null,
  defaultExpanded: readonly TValue[] | undefined,
): readonly [ReadonlySet<TValue>, (value: TValue, open: boolean) => void] {
  const [expanded, setExpanded] = useState<ReadonlySet<TValue>>(
    () =>
      new Set(
        defaultExpanded ??
          (chosen === null
            ? []
            : pathTo(nodes, chosen)
                .slice(0, -1)
                .map((node) => node.value)),
      ),
  );
  const change = (value: TValue, open: boolean): void => {
    setExpanded((before) => {
      const next = new Set(before);
      if (open) {
        next.add(value);
      } else {
        next.delete(value);
      }
      return next;
    });
  };
  return [expanded, change];
}

/** The tree's state: its rows, the branches expanded, and the row the focus is on, the chosen one at first, and the
 * first row whenever the focused one is hidden. */
interface TreeState<TValue extends string> {
  readonly rows: readonly TreeRow<TValue>[];
  readonly expanded: ReadonlySet<TValue>;
  readonly focused: TValue | undefined;
  readonly focus: (value: TValue) => void;
  readonly expand: (value: TValue, open: boolean) => void;
}

function useTreeState<TValue extends string>(
  nodes: readonly TreeNode<TValue>[],
  chosen: TValue | null,
  defaultExpanded: readonly TValue[] | undefined,
): TreeState<TValue> {
  const [expanded, expand] = useExpanded(nodes, chosen, defaultExpanded);
  const rows = visibleRows(nodes, expanded);
  const [focusedOwn, setFocusedOwn] = useState<TValue | undefined>(chosen ?? undefined);
  const shown = rows.some((row) => row.node.value === focusedOwn);
  return {
    expand,
    expanded,
    focus: setFocusedOwn,
    focused: shown ? focusedOwn : rows[0]?.node.value,
    rows,
  };
}

/** Applies a move: the focus lands on its row at once, or its branch expands or collapses. */
function applyMove<TValue extends string>(
  tree: TreeState<TValue>,
  move: TreeMove<TValue>,
  rowId: (value: TValue) => string,
): void {
  if (move.kind === "focus") {
    flushSync(() => {
      tree.focus(move.value);
    });
    document.querySelector<HTMLElement>(`#${CSS.escape(rowId(move.value))}`)?.focus();
  } else if (move.kind !== "none") {
    tree.expand(move.value, move.kind === "expand");
  }
}

/** What the keys do to the tree: Enter and Space choose the focused row, and the rest move the focus, expand or
 * collapse, as `moveFor` says. */
function useTreeKeys<TValue extends string>(
  tree: TreeState<TValue>,
  {
    choose,
    rowId,
  }: { readonly choose: (row: TreeRow<TValue>) => void; readonly rowId: (value: TValue) => string },
): (event: KeyboardEvent<HTMLUListElement>) => void {
  return (event) => {
    const focusedRow = tree.rows.find((row) => row.node.value === tree.focused);
    if (focusedRow === undefined) {
      return;
    }
    const chooses = event.key === "Enter" || event.key === " ";
    const move = chooses
      ? undefined
      : moveFor(event.key, {
          expanded: tree.expanded,
          focused: focusedRow.node.value,
          rows: tree.rows,
        });
    if (chooses || (move !== undefined && move.kind !== "none")) {
      event.preventDefault();
    }
    if (move === undefined) {
      choose(focusedRow);
    } else {
      applyMove(tree, move, rowId);
    }
  };
}

/** The node chosen, the app's or the tree's own, and choosing a row: a row that cannot be chosen, a branch where only
 * leaves can, expands or collapses instead. */
function useChoice<TValue extends string>(
  tree: TreeState<TValue>,
  {
    value,
    defaultValue,
    onValueChange,
    selectable,
  }: Pick<TreeProps<TValue>, "value" | "defaultValue" | "onValueChange" | "selectable">,
): {
  readonly chosen: TValue | null;
  readonly canChoose: (row: TreeRow<TValue>) => boolean;
  readonly choose: (row: TreeRow<TValue>) => void;
} {
  const [own, setOwn] = useState<TValue | null>(defaultValue ?? null);
  const canChoose = (row: TreeRow<TValue>): boolean => selectable !== "leaves" || !row.branch;
  return {
    canChoose,
    choose: (row) => {
      tree.focus(row.node.value);
      if (canChoose(row)) {
        setOwn(row.node.value);
        onValueChange?.(row.node.value);
      } else {
        tree.expand(row.node.value, !tree.expanded.has(row.node.value));
      }
    },
    chosen: value === undefined ? own : value,
  };
}

/** A tree to choose a node from. Name it with `aria-label`.
 *
 * @use For choosing from a hierarchy, such as a book under its desk or a strategy under its fund. In a form, use
 * TreeSelect; for a flat list, Select or MultiSelect.
 * @see TreeSelect, Select, MultiSelect
 *
 * @example
 * ```tsx
 * import { Tree } from "@basis/ui";
 *
 * const books = [
 *   { label: "Rates", value: "rates", children: [{ label: "Treasuries", value: "ust" }] },
 *   { label: "Credit", value: "credit", children: [{ label: "High yield", value: "hy" }] },
 * ];
 *
 * <Tree aria-label="Books" nodes={books} defaultValue="hy" />;
 * ```
 */
function Tree<TValue extends string>({
  nodes,
  defaultExpanded,
  "aria-label": ariaLabel,
  id,
  className,
  ...choice
}: TreeProps<TValue>): ReactElement {
  const initial = choice.value ?? choice.defaultValue ?? null;
  const tree = useTreeState(nodes, initial, defaultExpanded);
  const { chosen, canChoose, choose } = useChoice(tree, choice);
  const idPrefix = useId();
  const rowId = (rowValue: TValue): string => `${idPrefix}-${rowValue}`;
  return (
    <ul
      id={id}
      role="tree"
      aria-label={ariaLabel}
      data-slot="tree"
      className={cn("flex flex-col gap-px overflow-y-auto", className)}
      onKeyDown={useTreeKeys(tree, { choose, rowId })}
    >
      {tree.rows.map((row) => (
        <Row
          key={row.node.value}
          row={row}
          id={rowId(row.node.value)}
          chosen={row.node.value === chosen}
          focused={row.node.value === tree.focused}
          expanded={tree.expanded.has(row.node.value)}
          choosable={canChoose(row)}
          onToggle={() => {
            tree.expand(row.node.value, !tree.expanded.has(row.node.value));
          }}
          onChoose={() => {
            choose(row);
          }}
        />
      ))}
    </ul>
  );
}

export { Tree };
export type { TreeProps };
