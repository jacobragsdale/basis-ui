/* One area of the field list, Rows, Columns or Values: its chips in order, each dragged to move it, or moved a place
 * with Alt+Up and Alt+Down from its buttons, with a menu and a remove button so dragging is never required. A drag
 * over the area shows where it would land. */

import {
  Button,
  GripVerticalIcon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ChevronDownIcon,
  XIcon,
} from "@basis/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import type { SourceField } from "#grid/fields.ts";
import { measureName } from "#grid/labels.ts";
import type { Layout } from "#layout/layout.ts";

import { DragList } from "./drag-list.tsx";
import type { Dragged, Over } from "./drag-list.tsx";
import { moveChip, removeChip } from "./edit.ts";
import type { Target } from "./edit.ts";
import { GroupMenu } from "./group-menu.tsx";
import { areaNames } from "./labels.ts";
import type { ChipArea } from "./labels.ts";
import { MeasureMenu } from "./measure-menu.tsx";

/** What each area says when it is empty. */
const empty: Readonly<Record<ChipArea, string>> = {
  columns: "Drop fields here to group columns",
  rows: "Drop fields here to group rows",
  values: "Drop fields here to total them",
};

interface WellProps {
  readonly area: ChipArea;
  readonly layout: Layout;
  readonly fields: readonly SourceField[];
  /** What the panel is dragging, if anything; only that can be dropped here. */
  readonly dragging: Dragged | null;
  readonly onDrag: (dragged: Dragged | null) => void;
  /** Puts what the panel is dragging here. */
  readonly onDrop: (to: Target) => void;
  readonly onChange: (layout: Layout) => void;
  /** Asks for a filter on a chip's column. */
  readonly onFilter: (column: string) => void;
  /** Says what a move by the keyboard did, for screen readers. */
  readonly onSay: (text: string) => void;
}

/** One chip: its key, and its text. */
interface Chip {
  readonly key: string;
  readonly text: string;
}

/** An area's chips. A group's key is its column, and a measure's its place, so that its menu stays open while it
 * changes. */
function chipsOf(layout: Layout, area: ChipArea): readonly Chip[] {
  if (area === "values") {
    return layout.measures.map((entry, index) => ({
      key: String(index),
      text: measureName(entry),
    }));
  }
  const columns = area === "rows" ? layout.group_by : layout.split_by;
  return columns.map((column) => ({ key: column, text: layout.titles[column] ?? column }));
}

/** A Values chip's menu, in a popover from its button. */
function MeasureChipMenu({
  props,
  index,
  text,
}: {
  readonly props: WellProps;
  readonly index: number;
  readonly text: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label={`Options for ${text}`} />}
      >
        <ChevronDownIcon />
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={`Value ${text}`} className="w-80">
        <MeasureMenu
          layout={props.layout}
          measure={index}
          fields={props.fields}
          sorting={false}
          onChange={props.onChange}
          onDone={() => {
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** One chip: dragged by any part of it, with its menu and its remove button. */
function ChipLine({
  props,
  chip,
  index,
  over,
}: {
  readonly props: WellProps;
  readonly chip: Chip;
  readonly index: number;
  readonly over: Over;
}): ReactNode {
  const { area, layout, fields, onChange, onFilter } = props;
  return (
    <li
      data-index={index}
      data-drop={over === index ? "before" : undefined}
      draggable
      title={chip.text}
      className="relative flex h-7 cursor-grab items-center gap-1 rounded-md border bg-background pl-1 text-sm text-foreground before:absolute before:inset-x-0 before:-top-1 before:hidden before:h-0.5 before:rounded-full before:bg-primary data-[drop=before]:before:block [&>svg]:text-muted-foreground"
    >
      <GripVerticalIcon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{chip.text}</span>
      {area === "values" ? (
        <MeasureChipMenu props={props} index={index} text={chip.text} />
      ) : (
        <GroupMenu
          layout={layout}
          area={area}
          index={index}
          text={chip.text}
          fields={fields}
          onChange={onChange}
          onFilter={onFilter}
        />
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${chip.text}`}
        onClick={() => {
          onChange(removeChip(layout, { area, index }));
        }}
      >
        <XIcon />
      </Button>
    </li>
  );
}

/** An area of the field list. */
function Well(props: WellProps): ReactNode {
  const { area, layout, fields, dragging, onDrag, onDrop, onChange, onSay } = props;
  const chips = chipsOf(layout, area);
  const title = areaNames[area];
  const step = (index: number, delta: -1 | 1): void => {
    const at = delta < 0 ? index - 1 : index + 2;
    const next = moveChip(layout, { from: { area, index }, to: { area, at } }, fields);
    const now = Math.max(0, Math.min(index + delta, chips.length - 1));
    if (next !== layout) {
      onChange(next);
      onSay(
        `${chips[index]?.text ?? ""} moved to ${String(now + 1)} of ${String(chips.length)} in ${title}`,
      );
    }
  };
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      <DragList
        label={title}
        ordered
        count={chips.length}
        className="flex min-h-9 flex-col gap-1.5 rounded-lg border border-dashed p-1.5 data-[accepting=true]:border-primary data-[accepting=true]:bg-accent data-[drop-end=true]:border-b-2"
        dragOf={(index) => ({ chip: { area, index }, kind: "chip" })}
        onDrag={onDrag}
        dropping={{
          accepting: dragging !== null,
          onDrop: (at) => {
            onDrop({ area, at });
          },
        }}
        onStep={step}
      >
        {(over) =>
          chips.length === 0 ? (
            <li className="px-1.5 py-1 text-xs text-muted-foreground">{empty[area]}</li>
          ) : (
            chips.map((chip, index) => (
              <ChipLine key={chip.key} props={props} chip={chip} index={index} over={over} />
            ))
          )
        }
      </DragList>
    </section>
  );
}

export { Well };
