/* Which columns a grid shows, and in what order: a box per column, ticked when shown, with a search to find one.
 * Shown columns are dragged to reorder, or moved with Alt+Up and Alt+Down, and each can be pinned at the left. */

import { Checkbox, GripVerticalIcon, Input, PinIcon, Toggle } from "@basis/ui";
import { useState } from "react";
import type { DragEvent, KeyboardEvent, ReactNode } from "react";

import type { Layout } from "#layout/layout.ts";

import { shownColumns, withColumnBefore, withPinned, withShown } from "./edit.ts";
import type { SourceField } from "./fields.ts";

/** One line of the chooser. */
interface Item {
  readonly name: string;
  readonly title: string;
  readonly shown: boolean;
  readonly pinned: boolean;
}

interface ColumnChooserProps {
  readonly layout: Layout;
  readonly fields: readonly SourceField[];
  readonly onChange: (layout: Layout) => void;
}

/** Shown columns in their order, then the hidden ones, as far as `search` lets through. */
function itemsOf(layout: Layout, fields: readonly SourceField[], search: string): readonly Item[] {
  const shown = shownColumns(layout, fields);
  const hidden = fields.map((field) => field.name).filter((name) => !shown.includes(name));
  const needle = search.trim().toLowerCase();
  return [...shown, ...hidden]
    .map((name) => ({
      name,
      pinned: layout.pinned.includes(name),
      shown: shown.includes(name),
      title: layout.titles[name] ?? name,
    }))
    .filter(
      (item) =>
        needle === "" ||
        item.title.toLowerCase().includes(needle) ||
        item.name.toLowerCase().includes(needle),
    );
}

/** The column a shown column moves before, one place up or down, or undefined when it cannot move that way. */
function stepTarget(
  shown: readonly string[],
  column: string,
  delta: -1 | 1,
): string | null | undefined {
  const at = shown.indexOf(column);
  if (at === -1 || (delta < 0 && at === 0)) {
    return undefined;
  }
  return delta < 0 ? (shown[at - 1] ?? null) : (shown[at + 2] ?? null);
}

/** A drag of a shown column to another place in the list. */
interface Dragging {
  readonly from: string | null;
  readonly over: string | null;
}

/** What a column's line does: start or follow a drag, drop on it, show or hide it, pin it, or move it a place. */
interface LineActions {
  readonly onDrag: (dragging: Dragging) => void;
  readonly onDrop: (before: string) => void;
  readonly onShown: () => void;
  readonly onPinned: () => void;
  readonly onStep: (event: KeyboardEvent) => void;
}

/** One column's box and title, and its pin. */
function LineControls({
  item,
  onShown,
  onPinned,
  onStep,
}: { readonly item: Item } & Omit<LineActions, "onDrag" | "onDrop">): ReactNode {
  return (
    <>
      <GripVerticalIcon className="size-4 shrink-0" />
      <label className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
        <Checkbox checked={item.shown} onCheckedChange={onShown} onKeyDown={onStep} />
        <span className="truncate">{item.title}</span>
      </label>
      <Toggle
        size="sm"
        pressed={item.pinned}
        aria-label={`${item.pinned ? "Unpin" : "Pin"} ${item.title}`}
        onPressedChange={onPinned}
      >
        <PinIcon />
      </Toggle>
    </>
  );
}

/** One column's line, which a shown column is dragged by and dropped on. */
function ColumnLine({
  item,
  dragging,
  ...actions
}: { readonly item: Item; readonly dragging: Dragging } & LineActions): ReactNode {
  const { onDrag, onDrop } = actions;
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- dragging a line reorders the columns for the pointer; the keyboard reorders them with Alt+Up and Alt+Down on each line's box.
    <li
      draggable={item.shown}
      data-drop={dragging.over === item.name}
      className="flex items-center gap-1 rounded-md px-1 hover:bg-muted data-[drop=true]:border-t-2 data-[drop=true]:border-primary"
      onDragStart={() => {
        onDrag({ from: item.name, over: null });
      }}
      onDragOver={(event) => {
        if (dragging.from !== null && item.shown) {
          event.preventDefault();
          onDrag({ ...dragging, over: item.name });
        }
      }}
      onDragLeave={() => {
        onDrag({ ...dragging, over: null });
      }}
      onDrop={(event: DragEvent) => {
        event.preventDefault();
        onDrop(item.name);
      }}
    >
      <LineControls item={item} {...actions} />
    </li>
  );
}

/** The layout with a shown column moved a place up or down, as Alt+Up and Alt+Down move it; null for another key or
 * a column that cannot move that way. */
function movedByKey(
  event: KeyboardEvent,
  {
    layout,
    fields,
    column,
  }: { readonly layout: Layout; readonly fields: readonly SourceField[]; readonly column: string },
): Layout | null {
  const arrow = event.key === "ArrowUp" || event.key === "ArrowDown";
  const before = stepTarget(shownColumns(layout, fields), column, event.key === "ArrowUp" ? -1 : 1);
  return event.altKey && arrow && before !== undefined
    ? withColumnBefore(layout, fields, { before, column })
    : null;
}

/** The columns' lines, as far as the search lets through. */
function Lines({
  layout,
  fields,
  search,
  onChange,
}: ColumnChooserProps & { readonly search: string }): ReactNode {
  const [dragging, setDragging] = useState<Dragging>({ from: null, over: null });
  const step = (event: KeyboardEvent, column: string): void => {
    const moved = movedByKey(event, { column, fields, layout });
    if (moved !== null) {
      event.preventDefault();
      onChange(moved);
    }
  };
  const drop = (before: string): void => {
    const { from } = dragging;
    setDragging({ from: null, over: null });
    if (from !== null && from !== before) {
      onChange(withColumnBefore(layout, fields, { before, column: from }));
    }
  };
  return (
    <ul aria-label="Columns" className="max-h-80 overflow-auto">
      {itemsOf(layout, fields, search).map((item) => (
        <ColumnLine
          key={item.name}
          item={item}
          dragging={dragging}
          onDrag={setDragging}
          onDrop={drop}
          onShown={() => {
            onChange(withShown(layout, fields, { column: item.name, shown: !item.shown }));
          }}
          onPinned={() => {
            onChange(withPinned(layout, item.name, !item.pinned));
          }}
          onStep={(event) => {
            step(event, item.name);
          }}
        />
      ))}
    </ul>
  );
}

/** The column chooser. */
function ColumnChooser({ layout, fields, onChange }: ColumnChooserProps): ReactNode {
  const [search, setSearch] = useState("");
  return (
    <div className="flex flex-col gap-1.5">
      <Input
        type="search"
        placeholder="Find a column"
        aria-label="Find a column"
        value={search}
        onChange={(event) => {
          setSearch(event.currentTarget.value);
        }}
      />
      <Lines layout={layout} fields={fields} search={search} onChange={onChange} />
      <p className="text-xs text-muted-foreground">Drag to reorder, or press Alt+↑ and Alt+↓.</p>
    </div>
  );
}

export { ColumnChooser };
