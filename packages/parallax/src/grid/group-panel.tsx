/* The strip above a grid where its groups show: a chip for each level, outermost first, that ungroups it, and Expand
 * all and Collapse all. A header dragged onto the strip groups the grid by its column. */

import { Button, ChevronsDownUpIcon, ChevronsUpDownIcon, GroupIcon, XIcon } from "@basis/ui";
import { Fragment } from "react";
import type { ReactNode, Ref } from "react";

import type { Layout } from "#layout/layout.ts";

import { withAllExpanded, withoutGroup } from "./edit.ts";

interface GroupPanelProps {
  readonly layout: Layout;
  /** Whether a header is dragged over the strip, which would group by its column. */
  readonly dropping: boolean;
  readonly onChange: (layout: Layout) => void;
  /** The strip, which the grid hit-tests a dragged header against. */
  readonly panelRef: Ref<HTMLElement>;
}

/** A group level's chip, whose button ungroups it. */
function GroupChip({
  layout,
  column,
  onChange,
}: Pick<GroupPanelProps, "layout" | "onChange"> & { readonly column: string }): ReactNode {
  const title = layout.titles[column] ?? column;
  return (
    <span
      data-slot="grid-group-chip"
      className="inline-flex h-6 items-center gap-1 rounded-full border bg-background pl-2 text-foreground [&_svg]:size-3.5"
    >
      <GroupIcon />
      {title}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Stop grouping by ${title}`}
        onClick={() => {
          onChange(withoutGroup(layout, column));
        }}
      >
        <XIcon />
      </Button>
    </span>
  );
}

/** Expand all and Collapse all, which open or close every group, forgetting each one's own state. */
function ExpandAll({ layout, onChange }: Pick<GroupPanelProps, "layout" | "onChange">): ReactNode {
  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          onChange(withAllExpanded(layout, true));
        }}
      >
        <ChevronsUpDownIcon />
        Expand all
      </Button>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          onChange(withAllExpanded(layout, false));
        }}
      >
        <ChevronsDownUpIcon />
        Collapse all
      </Button>
    </>
  );
}

/** The group panel. */
function GroupPanel({ layout, dropping, onChange, panelRef }: GroupPanelProps): ReactNode {
  const grouped = layout.group_by.length > 0;
  return (
    <section
      ref={panelRef}
      aria-label="Groups"
      data-drop={dropping}
      className="flex min-h-8 flex-wrap items-center gap-1.5 border-b px-2.5 py-0.5 text-xs text-muted-foreground data-[drop=true]:bg-accent data-[drop=true]:outline-2 data-[drop=true]:-outline-offset-2 data-[drop=true]:outline-primary data-[drop=true]:outline-dashed"
    >
      {grouped ? null : <span>Drag a column header here to group by it</span>}
      {layout.group_by.map((column, index) => (
        <Fragment key={column}>
          {index === 0 ? null : <span aria-hidden>›</span>}
          <GroupChip layout={layout} column={column} onChange={onChange} />
        </Fragment>
      ))}
      <span className="flex-1" />
      {grouped ? <ExpandAll layout={layout} onChange={onChange} /> : null}
    </section>
  );
}

export { GroupPanel };
