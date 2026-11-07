/* The dataset's fields, as Excel's PivotTable field list shows them: searchable, ticked when the pivot uses them, and
 * dragged into an area. Ticking adds a field where Excel does, numbers to Values and anything else to Rows; unticking
 * takes it out of every area. Each field's menu adds it to any area, so dragging is never required. */

import {
  Button,
  Checkbox,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@basis/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import type { SourceField } from "#grid/fields.ts";
import type { Layout } from "#layout/layout.ts";

import { DragList } from "./drag-list.tsx";
import type { Dragged } from "./drag-list.tsx";
import { areasOf, placeField, withField, withoutField } from "./edit.ts";
import { areaNames } from "./labels.ts";
import type { ChipArea } from "./labels.ts";

interface FieldListProps {
  readonly layout: Layout;
  readonly fields: readonly SourceField[];
  readonly onChange: (layout: Layout) => void;
  readonly onDrag: (dragged: Dragged | null) => void;
  /** Asks for a filter on a field. */
  readonly onFilter: (column: string) => void;
}

/** A field as the list shows it: whether the pivot uses it, and in which areas. */
interface Line {
  readonly field: SourceField;
  readonly used: boolean;
  readonly areas: string;
}

const placed: readonly ChipArea[] = ["rows", "columns", "values"];

/** The fields the search lets through. */
function linesOf(layout: Layout, fields: readonly SourceField[], search: string): readonly Line[] {
  const needle = search.trim().toLowerCase();
  return fields
    .filter((field) => needle === "" || field.name.toLowerCase().includes(needle))
    .map((field) => {
      const areas = areasOf(layout, field.name);
      return {
        areas: areas.map((area) => areaNames[area]).join(", "),
        field,
        used: areas.length > 0,
      };
    });
}

/** A field's menu, which adds it to any area. */
function AddMenu({
  props,
  field,
}: {
  readonly props: FieldListProps;
  readonly field: SourceField;
}): ReactNode {
  const { layout, onChange, onFilter } = props;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label={`Add ${field.name} to`} />}
      >
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" aria-label={`Add ${field.name}`}>
        {placed.map((area) => (
          <DropdownMenuItem
            key={area}
            onClick={() => {
              onChange(placeField(layout, field, { area, at: null }));
            }}
          >
            Add to {areaNames[area]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          onClick={() => {
            onFilter(field.name);
          }}
        >
          Add to Filters
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One field: its box, its name and where it is used, and its menu. */
function FieldLine({
  props,
  line,
  index,
}: {
  readonly props: FieldListProps;
  readonly line: Line;
  readonly index: number;
}): ReactNode {
  const { layout, onChange } = props;
  const { field } = line;
  return (
    <li
      data-index={index}
      draggable
      className="flex cursor-grab items-center gap-1 rounded-md pr-0.5 pl-1 hover:bg-muted"
    >
      <label className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
        <Checkbox
          checked={line.used}
          onCheckedChange={(checked) => {
            onChange(checked ? withField(layout, field) : withoutField(layout, field.name));
          }}
        />
        <span className="truncate">{field.name}</span>
      </label>
      <span className="text-xs text-muted-foreground">{line.areas}</span>
      <AddMenu props={props} field={field} />
    </li>
  );
}

/** The field list. */
function FieldList(props: FieldListProps): ReactNode {
  const { layout, fields, onDrag } = props;
  const [search, setSearch] = useState("");
  const lines = linesOf(layout, fields, search);
  return (
    <div className="flex flex-col gap-1.5">
      <Input
        type="search"
        placeholder="Find a field"
        aria-label="Find a field"
        value={search}
        onChange={(event) => {
          setSearch(event.currentTarget.value);
        }}
      />
      <DragList
        label="Fields"
        ordered={false}
        count={lines.length}
        className="max-h-56 overflow-auto rounded-lg border bg-background p-0.5"
        dragOf={(index) => {
          const line = lines[index];
          return line === undefined ? null : { column: line.field.name, kind: "field" };
        }}
        onDrag={onDrag}
        dropping={null}
      >
        {() =>
          lines.length === 0 ? (
            <li className="px-1.5 py-1 text-xs text-muted-foreground">No field matches</li>
          ) : (
            lines.map((line, index) => (
              <FieldLine key={line.field.name} props={props} line={line} index={index} />
            ))
          )
        }
      </DragList>
    </div>
  );
}

export { FieldList };
