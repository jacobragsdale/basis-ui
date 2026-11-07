/* A grid's body: the element that scrolls, which screen readers read as the grid, the canvas inside it, and the
 * elements around the canvas that the controller moves as it scrolls. React renders them with fixed classes; the
 * controller sizes and places them without a render. Screen readers, which cannot read the canvas, read the focused
 * cell as the grid's active descendant, the selection's size, the totals, and a description of the view. */

import type { ReactNode, RefObject } from "react";

import type { ViewHandle } from "#engine/view.ts";
import type { Layout } from "#layout/layout.ts";

import type { GridController } from "./controller.ts";
import type { SourceField } from "./fields.ts";
import { GridMenu } from "./grid-menu.tsx";
import type { MeasureMenuProps } from "./grid-menu.tsx";
import type { GridSnapshot } from "./snapshot.ts";
import type { ActiveCell } from "./speech.ts";
import { useGridParts } from "./use-grid-parts.ts";
import type { GridRefs } from "./use-grid-parts.ts";

interface GridBodyProps {
  readonly id: string;
  readonly controller: GridController;
  readonly snapshot: GridSnapshot;
  /** What the grid is called, for screen readers. */
  readonly label: string;
  /** Why the view failed, or why the engine refused a change, or null. */
  readonly error: string | null;
  readonly layout: Layout | null;
  readonly fields: readonly SourceField[];
  readonly handle: ViewHandle | null;
  readonly onChange: (layout: Layout) => void;
  readonly measureMenu: ((props: MeasureMenuProps) => ReactNode) | undefined;
  /** The strip a dragged header can drop on. */
  readonly groupPanel: RefObject<HTMLElement | null>;
}

/** The text alternative of the canvas: the view's size and how to move about it. */
function describe(rows: number | null, columns: number): string {
  if (rows === null) {
    return "The rows are loading.";
  }
  const size = `${rows.toLocaleString("en-US")} rows and ${columns.toLocaleString("en-US")} columns.`;
  return `${size} Arrow keys move between cells, Shift extends the selection, Ctrl+C copies it, and Alt+Down opens a column's menu.`;
}

/** The focused cell, the grid's active descendant, inside its row; a canvas grid has no table for them to sit in. */
function Active({ cell }: { readonly cell: ActiveCell | null }): ReactNode {
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the canvas draws the rows; this row only holds the focused cell for screen readers, inside the grid's scroll element, where a <tr> cannot be.
      role="row"
      aria-rowindex={cell?.rowIndex}
      className="sr-only"
    >
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- as for the row: the focused cell, outside any table.
        role="gridcell"
        id={cell?.id}
        aria-colindex={cell?.columnIndex}
        aria-selected={cell?.selected}
      >
        {cell?.text}
      </div>
    </div>
  );
}

/** What screen readers hear besides the cell: the totals and the selection's size. */
function Spoken({ snapshot }: { readonly snapshot: GridSnapshot }): ReactNode {
  return (
    <>
      {snapshot.totalsText === null ? null : (
        <output aria-label="Totals row" className="sr-only">
          {snapshot.totalsText}
        </output>
      )}
      <div aria-live="polite" className="sr-only">
        {snapshot.announcement}
      </div>
    </>
  );
}

/** The element that scrolls, with the canvas and the focused cell inside it. */
function Scroll({
  id,
  label,
  snapshot,
  parts,
}: Pick<GridBodyProps, "id" | "label" | "snapshot"> & { readonly parts: GridRefs }): ReactNode {
  const { scroll, spacer, canvas } = parts;
  return (
    <div
      ref={scroll}
      id={id}
      role="grid"
      tabIndex={0}
      aria-label={label}
      aria-describedby={`${id}-description`}
      aria-rowcount={snapshot.totalRows ?? 0}
      aria-colcount={snapshot.totalColumns}
      aria-activedescendant={snapshot.active?.id}
      aria-multiselectable
      className="absolute inset-0 overflow-auto scrollbar-thin outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <div ref={spacer} className="absolute top-0 left-0" />
      <canvas ref={canvas} aria-hidden className="sticky top-0 left-0 block" />
      <Active cell={snapshot.active} />
    </div>
  );
}

/** The tooltip of a cut cell, and why the view failed. */
function Overlays({
  tooltip,
  error,
}: {
  readonly tooltip: GridRefs["tooltip"];
  readonly error: string | null;
}): ReactNode {
  return (
    <>
      <div
        ref={tooltip}
        role="tooltip"
        hidden
        className="pointer-events-none absolute z-10 max-w-md rounded-md border bg-popover px-2 py-1 text-xs break-words whitespace-pre-wrap text-popover-foreground shadow-md"
      />
      {error === null ? null : (
        <div
          role="alert"
          data-slot="grid-error"
          className="absolute inset-x-0 bottom-0 bg-destructive px-2.5 py-1.5 text-sm text-destructive-foreground"
        >
          {error}
        </div>
      )}
    </>
  );
}

/** The grid's body. */
function GridBody(props: GridBodyProps): ReactNode {
  const {
    id,
    controller,
    snapshot,
    error,
    layout,
    fields,
    handle,
    onChange,
    measureMenu,
    groupPanel,
  } = props;
  const parts = useGridParts(controller, groupPanel);
  const { body, menuAnchor, scroll, pinnedEdge, tooltip } = parts;
  return (
    <div ref={body} data-slot="grid-body" className="relative min-h-0 flex-1">
      <Scroll id={id} label={props.label} snapshot={snapshot} parts={parts} />
      <p id={`${id}-description`} className="sr-only">
        {describe(snapshot.totalRows, snapshot.totalColumns)}
      </p>
      <div
        ref={pinnedEdge}
        hidden
        className="pointer-events-none absolute inset-y-0 w-1.5 bg-linear-to-r from-foreground/15 to-transparent"
      />
      <GridMenu
        controller={controller}
        menu={snapshot.menu}
        layout={layout}
        fields={fields}
        handle={handle}
        anchorRef={menuAnchor}
        scrollRef={scroll}
        onChange={onChange}
        measureMenu={measureMenu}
      />
      <Spoken snapshot={snapshot} />
      <Overlays tooltip={tooltip} error={error} />
    </div>
  );
}

export { GridBody };
