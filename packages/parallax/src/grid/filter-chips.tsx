/* A chip for each of a grid's filters, saying what it keeps, each with its own remove button, and Clear all. */

import { Button, XIcon } from "@basis/ui";
import type { ReactNode } from "react";

import type { Layout } from "#layout/layout.ts";

import { filterLabel, withoutFilter, withoutFilters } from "./filters.ts";

interface FilterChipsProps {
  /** The layout whose filters show. */
  readonly layout: Layout;
  /** Takes the layout after a filter, or every filter and the search, came off. */
  readonly onChange: (layout: Layout) => void;
}

/** The chips of a layout's filters. */
function FilterChips({ layout, onChange }: FilterChipsProps): ReactNode {
  const chips = layout.filters.map((filter, index) => ({
    index,
    text: filterLabel(filter, (column) => layout.titles[column] ?? column),
  }));
  // Clear all shows when it would clear more than one thing.
  const clearsAll = chips.length + (layout.search === "" ? 0 : 1) > 1;
  return (
    <>
      {chips.map((chip) => (
        <span
          key={chip.index}
          data-slot="grid-filter-chip"
          title={chip.text}
          className="inline-flex h-6 max-w-80 items-center gap-0.5 rounded-full bg-secondary pl-2.5 text-xs text-secondary-foreground"
        >
          <span className="truncate">{chip.text}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove the filter ${chip.text}`}
            onClick={() => {
              onChange(withoutFilter(layout, chip.index));
            }}
          >
            <XIcon />
          </Button>
        </span>
      ))}
      {clearsAll ? (
        <Button
          variant="link"
          size="xs"
          onClick={() => {
            onChange(withoutFilters(layout));
          }}
        >
          Clear all
        </Button>
      ) : null}
    </>
  );
}

export { FilterChips };
