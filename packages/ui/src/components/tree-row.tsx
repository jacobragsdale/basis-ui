/* One row of a Tree: a treeitem at its level, indented by it, with a chevron on a branch, which turns when it is
 * expanded, and its label. */

import { cn } from "cn";
import type { CSSProperties, ReactElement } from "react";

import { ChevronRightIcon } from "#vendor/lucide/chevron-right.tsx";

import type { TreeRow } from "./tree-model.ts";

/** How far each level indents a row, in pixels. */
const indentPerLevel = 16;

interface RowProps<TValue extends string> {
  readonly row: TreeRow<TValue>;
  readonly id: string;
  readonly chosen: boolean;
  readonly focused: boolean;
  readonly expanded: boolean;
  readonly choosable: boolean;
  readonly onToggle: () => void;
  readonly onChoose: () => void;
}

/** One row: its chevron, if a branch, and its label. A click on the chevron expands or collapses it; on the label, it
 * chooses the row, or expands a branch that cannot be chosen. */
function Row<TValue extends string>({
  row,
  id,
  chosen,
  focused,
  expanded,
  choosable,
  onToggle,
  onChoose,
}: RowProps<TValue>): ReactElement {
  const indent: CSSProperties & Record<"--tree-indent", string> = {
    "--tree-indent": `${String((row.level - 1) * indentPerLevel)}px`,
  };
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- the tree takes the keys for every row, as the tree view pattern asks.
    <li
      id={id}
      role="treeitem"
      aria-level={row.level}
      aria-expanded={row.branch ? expanded : undefined}
      aria-selected={choosable ? chosen : undefined}
      tabIndex={focused ? 0 : -1}
      data-chosen={chosen}
      style={indent}
      className="flex min-h-target cursor-default items-center gap-1 rounded-md py-1 pr-2 pl-(--tree-indent) text-sm outline-none select-none hover:bg-muted focus-visible:outline-solid focus-visible:outline focus-visible:outline-offset-(--focus-offset) focus-visible:outline-ring data-[chosen=true]:bg-selection"
      onClick={choosable ? onChoose : onToggle}
    >
      <span
        aria-hidden="true"
        className="flex size-(--control-md-icon) shrink-0 items-center justify-center"
        onClick={(event) => {
          if (row.branch) {
            event.stopPropagation();
            onToggle();
          }
        }}
      >
        {row.branch ? (
          <span className={cn("flex", expanded && "rotate-90")}>
            <ChevronRightIcon className="size-(--control-sm-icon)" />
          </span>
        ) : null}
      </span>
      <span className="truncate">{row.node.label}</span>
    </li>
  );
}

export { Row };
