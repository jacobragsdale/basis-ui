/* A right click's menu on the grid's cells, at the pointer, in place of the browser's own: copy, with headers or
 * without, filter by the cell's value or exclude it, sort and pin its column, fit it or every column, export, and the
 * app's own items. It also hands the app the grid's cell clicks and row activations, which the pointer and the
 * keyboard send up the grid's element. */

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@basis/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";

import type { ExportFormat } from "#engine/messages.ts";
import type { Layout } from "#layout/layout.ts";

import { GridActions } from "./actions.ts";
import type { GridController } from "./controller.ts";
import { isPivotLayout } from "./edit.ts";
import { cellClickEvent, cellOf, refOf, rowActivateEvent, rowOf } from "./events.ts";
import type { GridCell, GridMenuItem, GridRow } from "./events.ts";

/** What the app hears of the grid's cells, and adds to their menu. */
interface GridEvents {
  readonly onCellClick: ((cell: GridCell) => void) | undefined;
  readonly onRowActivate: ((row: GridRow) => void) | undefined;
  readonly onContextMenu: ((cell: GridCell | null) => void) | undefined;
  readonly contextMenuItems: ((cell: GridCell | null) => readonly GridMenuItem[]) | undefined;
}

interface CellMenuProps {
  readonly controller: GridController;
  readonly layout: Layout | null;
  readonly events: GridEvents;
  readonly onExport: (format: ExportFormat) => void;
  readonly children: ReactNode;
}

/** Hands the app the cell clicks and row activations that reach `element`, until the returned function is called. */
function listen(
  element: HTMLElement,
  controller: GridController,
  latest: { readonly current: GridEvents },
): () => void {
  const clicked = (event: Event): void => {
    const ref = refOf(event);
    const cell = ref === null ? null : cellOf(controller.host(), ref);
    if (cell !== null) {
      latest.current.onCellClick?.(cell);
    }
  };
  const activated = (event: Event): void => {
    const ref = refOf(event);
    if (ref !== null) {
      latest.current.onRowActivate?.(rowOf(controller.host(), ref.row));
    }
  };
  element.addEventListener(cellClickEvent, clicked);
  element.addEventListener(rowActivateEvent, activated);
  return (): void => {
    element.removeEventListener(cellClickEvent, clicked);
    element.removeEventListener(rowActivateEvent, activated);
  };
}

/** Hands the app the cell clicks and row activations that reach `element`, through its latest props. */
function useCellEvents(
  element: HTMLElement | null,
  controller: GridController,
  events: GridEvents,
): void {
  const latest = useRef(events);
  useEffect(() => {
    latest.current = events;
  });
  useEffect(
    () => (element === null ? undefined : listen(element, controller, latest)),
    [element, controller],
  );
}

/** A list of menu items, each a label and what choosing it does. */
type Entries = readonly (readonly [label: string, act: () => void])[];

/** Menu items, from a list. */
function Items({ entries }: { readonly entries: Entries }): ReactNode {
  return entries.map(([label, act]) => (
    <ContextMenuItem
      key={label}
      onClick={() => {
        act();
      }}
    >
      {label}
    </ContextMenuItem>
  ));
}

/** A table's cell's items: filtering by its value or excluding it, and its column's sort and pin. */
function tableEntries(actions: GridActions, cell: GridCell, pinned: boolean): readonly Entries[] {
  const shown = cell.text === "" ? "(blank)" : cell.text;
  return [
    [
      [
        `Filter by ${shown}`,
        () => {
          actions.filterBy(cell, false);
        },
      ],
      [
        `Exclude ${shown}`,
        () => {
          actions.filterBy(cell, true);
        },
      ],
    ],
    [
      [
        "Sort smallest first",
        () => {
          actions.sortBy(cell.column, false);
        },
      ],
      [
        "Sort largest first",
        () => {
          actions.sortBy(cell.column, true);
        },
      ],
      [
        pinned ? "Unpin column" : "Pin column",
        () => {
          actions.pin(cell.column, !pinned);
        },
      ],
    ],
  ];
}

/** Where a right click opened the menu: the data cell and its column, or null off the cells. */
interface MenuAt {
  readonly cell: GridCell | null;
  readonly column: number | null;
}

/** Copying the selection, with its headers or without. */
function copyEntries(actions: GridActions): Entries {
  return [
    [
      "Copy",
      (): void => {
        actions.copy(false).catch(reportError);
      },
    ],
    [
      "Copy with headers",
      (): void => {
        actions.copy(true).catch(reportError);
      },
    ],
  ];
}

/** Fitting the cell's column, when there is one, or every column. */
function fitEntries(actions: GridActions, column: number | null): Entries {
  const all = [
    "Fit all columns",
    (): void => {
      actions.fit("all");
    },
  ] as const;
  return column === null
    ? [all]
    : [
        [
          "Fit this column",
          () => {
            actions.fit(column);
          },
        ],
        all,
      ];
}

/** Exporting what the grid shows. */
function exportEntries(onExport: (format: ExportFormat) => void): Entries {
  return [
    [
      "Export to Excel",
      () => {
        onExport("xlsx");
      },
    ],
    [
      "Export to CSV",
      () => {
        onExport("csv");
      },
    ],
  ];
}

/** The menu's groups of items: a cell's copying, filtering, sorting and pinning, then fitting and exporting. */
function entriesOf(
  actions: GridActions,
  {
    at,
    layout,
    onExport,
  }: {
    readonly at: MenuAt;
    readonly layout: Layout | null;
    readonly onExport: (format: ExportFormat) => void;
  },
): readonly Entries[] {
  const { cell, column } = at;
  const table = cell !== null && layout !== null && !isPivotLayout(layout);
  return [
    ...(cell === null ? [] : [copyEntries(actions)]),
    ...(table ? tableEntries(actions, cell, layout.pinned.includes(cell.column)) : []),
    fitEntries(actions, column),
    exportEntries(onExport),
  ];
}

/** What the menu holds: groups of items between separators, and the app's own last. */
function MenuItems({
  groups,
  extra,
}: {
  readonly groups: readonly Entries[];
  readonly extra: readonly GridMenuItem[];
}): ReactNode {
  const all = [...groups, extra.map((item) => [item.label, item.onSelect] as const)].filter(
    (group) => group.length > 0,
  );
  return all.map((entries, index) => (
    <div key={entries[0]?.[0] ?? index} role="none">
      {index === 0 ? null : <ContextMenuSeparator />}
      <Items entries={entries} />
    </div>
  ));
}

/** The menu a right click opens on the grid, around its scrolling body. */
function CellMenu({ controller, layout, events, onExport, children }: CellMenuProps): ReactNode {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [at, setAt] = useState<MenuAt>({ cell: null, column: null });
  const actions = useMemo(() => new GridActions(controller.host()), [controller]);
  useCellEvents(element, controller, events);
  const opened = (event: MouseEvent): void => {
    const host = controller.host();
    const box = host.dom.parts.canvas.getBoundingClientRect();
    const [x, y] = [event.clientX - box.left, event.clientY - box.top];
    const cell = actions.cellAt(x, y);
    // The column the menu opened on, which its Fit this column fits, whatever the selection's focus.
    setAt({ cell, column: cell === null ? null : (host.hit(x, y)?.column ?? null) });
    events.onContextMenu?.(cell);
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger ref={setElement} className="absolute inset-0" onContextMenu={opened}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent data-slot="grid-cell-menu">
        <MenuItems
          groups={entriesOf(actions, { at, layout, onExport })}
          extra={events.contextMenuItems?.(at.cell) ?? []}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export { CellMenu };
export type { GridEvents };
