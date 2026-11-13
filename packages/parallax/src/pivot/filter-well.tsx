/* The field list's Filters area: a chip for each filtered column, which opens the same filter editor as a grid's header
 * menu. A field put here shows "(All)" with its editor open until something is picked: an empty filter would keep no
 * rows, so it stays out of the layout until it says what to keep, and its chip stays to pick one. */

import { Button, Popover, PopoverContent, PopoverTrigger, XIcon } from "@basis/ui";
import type { ReactNode } from "react";

import { ColumnFilter } from "#grid/column-filter.tsx";
import type { SourceField } from "#grid/fields.ts";
import { filterLabel, withColumnCondition } from "#grid/filters.ts";
import type { ValueSource } from "#grid/value-picker.tsx";
import type { Layout } from "#layout/layout.ts";

import { DragList } from "./drag-list.tsx";
import type { Dragged } from "./drag-list.tsx";
import type { FilterChips } from "./use-filter-chips.ts";

interface FilterWellProps {
  readonly layout: Layout;
  readonly fields: readonly SourceField[];
  /** Where a column's values come from, for its list. */
  readonly source: ValueSource;
  readonly chips: FilterChips;
  /** What the panel is dragging, if anything; only that can be dropped here. */
  readonly dragging: Dragged | null;
  readonly onDrop: () => void;
  readonly onChange: (layout: Layout) => void;
}

/** One chip of the area: what its column keeps. */
interface Chip {
  readonly column: string;
  readonly title: string;
  readonly text: string;
}

/** A chip for each column with filters of its own, then each column added that filters nothing yet. */
function chipsOf(layout: Layout, added: readonly string[]): readonly Chip[] {
  const title = (column: string): string => layout.titles[column] ?? column;
  const own = layout.filters.filter((filter) => filter.columns.length === 0);
  const columns = [...new Set([...own.map((filter) => filter.column), ...added])];
  return columns.map((column) => {
    const filters = own.filter((filter) => filter.column === column);
    const text =
      filters.length === 0
        ? `${title(column)}: (All)`
        : filters.map((filter) => filterLabel(filter, title)).join(" and ");
    return { column, text, title: title(column) };
  });
}

/** A filter chip's remove button, which takes the chip and the column's filters away. */
function RemoveFilter({
  props,
  chip,
}: {
  readonly props: FilterWellProps;
  readonly chip: Chip;
}): ReactNode {
  const { layout, chips, onChange } = props;
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Remove the filter on ${chip.title}`}
      onClick={() => {
        chips.forget(chip.column);
        onChange(withColumnCondition(layout, chip.column, { kind: "none" }));
      }}
    >
      <XIcon />
    </Button>
  );
}

/** A filter's chip: the button that opens its editor, and its remove button. */
function FilterChip({
  props,
  chip,
  index,
}: {
  readonly props: FilterWellProps;
  readonly chip: Chip;
  readonly index: number;
}): ReactNode {
  const { layout, fields, source, chips, onChange } = props;
  const { setOpen } = chips;
  const field = fields.find((each) => each.name === chip.column);
  const kind = field?.kind ?? "text";
  return (
    <li
      data-index={index}
      title={chip.text}
      className="flex h-7 items-center gap-0.5 rounded-md border bg-background text-sm text-foreground"
    >
      <Popover
        open={chips.open === chip.column}
        onOpenChange={(open) => {
          setOpen(open ? chip.column : null);
        }}
      >
        <PopoverTrigger
          render={<Button variant="ghost" size="xs" className="min-w-0 flex-1 justify-start" />}
        >
          <span className="truncate">{chip.text}</span>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label={`Filter ${chip.title}`}>
          <ColumnFilter
            layout={layout}
            column={chip.column}
            kind={kind}
            format={layout.formats[chip.column] ?? field?.format}
            source={source}
            error={null}
            onChange={onChange}
          />
        </PopoverContent>
      </Popover>
      <RemoveFilter props={props} chip={chip} />
    </li>
  );
}

/** The Filters area. */
function FilterWell(props: FilterWellProps): ReactNode {
  const { layout, chips, dragging, onDrop } = props;
  const shown = chipsOf(layout, chips.added);
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Filters</h3>
      <DragList
        label="Filters"
        ordered
        count={shown.length}
        className="flex min-h-9 flex-col gap-1.5 rounded-lg border border-dashed p-1.5 data-[accepting=true]:border-primary data-[accepting=true]:bg-accent"
        dragOf={() => null}
        onDrag={() => {
          // Filters are not dragged out; a filter is removed with its chip's button.
        }}
        dropping={{ accepting: dragging !== null, onDrop }}
      >
        {() =>
          shown.length === 0 ? (
            <li className="px-1.5 py-1 text-xs text-muted-foreground">
              Drop fields here to filter by them
            </li>
          ) : (
            shown.map((chip, index) => (
              <FilterChip key={chip.column} props={props} chip={chip} index={index} />
            ))
          )
        }
      </DragList>
    </section>
  );
}

export { FilterWell };
