/* What Tree and TreeSelect know of a tree: its nodes, the rows it shows with some nodes expanded, each node's path from
 * the root, and where a key moves the focus, as the WAI-ARIA tree view pattern has it. Pure functions, so the
 * component's keys are tested without a browser. */

/** One node of a tree: its value, unique in the tree, the words it shows, and its children, if it has any. */
interface TreeNode<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  readonly children?: readonly TreeNode<TValue>[] | undefined;
}

/** A row the tree shows: its node, its depth from 1, its parent's value, and whether it has children. */
interface TreeRow<TValue extends string> {
  readonly node: TreeNode<TValue>;
  readonly level: number;
  readonly parent: TValue | undefined;
  readonly branch: boolean;
}

function isBranch<TValue extends string>(node: TreeNode<TValue>): boolean {
  return (node.children?.length ?? 0) > 0;
}

/** Where a list of nodes sits: the depth of its rows, from 1, and their parent's value. */
interface Placement<TValue extends string> {
  readonly level: number;
  readonly parent: TValue | undefined;
}

const atTheRoot = { level: 1, parent: undefined } as const;

/** The rows a tree shows, in order: every root, and the children of each expanded branch under it. */
function visibleRows<TValue extends string>(
  nodes: readonly TreeNode<TValue>[],
  expanded: ReadonlySet<TValue>,
  { level, parent }: Placement<TValue> = atTheRoot,
): readonly TreeRow<TValue>[] {
  return nodes.flatMap((node) => {
    const row: TreeRow<TValue> = { branch: isBranch(node), level, node, parent };
    const open = row.branch && expanded.has(node.value);
    const below = { level: level + 1, parent: node.value };
    return open ? [row, ...visibleRows(node.children ?? [], expanded, below)] : [row];
  });
}

/** The nodes from a root down to the node of `value`, or none when no node has it. */
function pathTo<TValue extends string>(
  nodes: readonly TreeNode<TValue>[],
  value: TValue,
): readonly TreeNode<TValue>[] {
  for (const node of nodes) {
    if (node.value === value) {
      return [node];
    }
    const below = pathTo(node.children ?? [], value);
    if (below.length > 0) {
      return [node, ...below];
    }
  }
  return [];
}

/** What a key does in the tree: move the focus to a value, expand or collapse a branch, or nothing it knows. */
type TreeMove<TValue extends string> =
  | { readonly kind: "focus"; readonly value: TValue }
  | { readonly kind: "expand"; readonly value: TValue }
  | { readonly kind: "collapse"; readonly value: TValue }
  | { readonly kind: "none" };

const none = { kind: "none" } as const;

/** Where the focus is: the row's value, the rows shown, and the branches expanded. */
interface TreeFocus<TValue extends string> {
  readonly focused: TValue;
  readonly rows: readonly TreeRow<TValue>[];
  readonly expanded: ReadonlySet<TValue>;
}

/** The focused row, its index among the rows, and whether it is an open branch. */
interface At<TValue extends string> {
  readonly row: TreeRow<TValue>;
  readonly index: number;
  readonly open: boolean;
  readonly focusAt: (index: number) => TreeMove<TValue>;
}

/** What each key does from the focused row. */
const keyMoves: Readonly<
  Record<string, <TValue extends string>(at: At<TValue>, count: number) => TreeMove<TValue>>
> = {
  ArrowDown: (at) => at.focusAt(at.index + 1),
  ArrowLeft: (at) => {
    if (at.open) {
      return { kind: "collapse", value: at.row.node.value };
    }
    return at.row.parent === undefined ? none : { kind: "focus", value: at.row.parent };
  },
  ArrowRight: (at) => {
    if (!at.row.branch) {
      return none;
    }
    return at.open ? at.focusAt(at.index + 1) : { kind: "expand", value: at.row.node.value };
  },
  ArrowUp: (at) => at.focusAt(at.index - 1),
  End: (at, count) => at.focusAt(count - 1),
  Home: (at) => at.focusAt(0),
};

/** What `key` does with the focus where it is: Up and Down move a row, Home and End to the first and last, Right
 * expands a closed branch or moves into an open one, Left collapses an open branch or moves to the parent. */
function moveFor<TValue extends string>(
  key: string,
  { focused, rows, expanded }: TreeFocus<TValue>,
): TreeMove<TValue> {
  const index = rows.findIndex((row) => row.node.value === focused);
  const row = rows[index];
  const move = keyMoves[key];
  if (row === undefined || move === undefined) {
    return none;
  }
  const focusAt = (at: number): TreeMove<TValue> => {
    const target = rows[at];
    return target === undefined ? none : { kind: "focus", value: target.node.value };
  };
  return move({ focusAt, index, open: row.branch && expanded.has(focused), row }, rows.length);
}

export { isBranch, moveFor, pathTo, visibleRows };
export type { TreeFocus, TreeMove, TreeNode, TreeRow };
