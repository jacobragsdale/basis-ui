/* The grid's toolbar: a search box, a chip for each filter with Clear all, Expand all and Collapse all for a pivot's
 * groups, Columns and Totals, Export, and Maximize. Each edit goes out as a new layout; the toolbar keeps no state of
 * its own. */

import { Button, ChevronsDownUpIcon, ChevronsUpDownIcon } from "@basis/ui";
import type { ReactNode, Ref } from "react";

import type { ExportFormat } from "#engine/messages.ts";
import type { Layout } from "#layout/layout.ts";
import { MaximizeButton } from "#react/maximize-parts.tsx";

import { ColumnTools } from "./column-tools.tsx";
import { searchColumns, withAllExpanded } from "./edit.ts";
import { ExportButton } from "./export-button.tsx";
import type { SourceField } from "./fields.ts";
import { FilterChips } from "./filter-chips.tsx";
import { withSearch } from "./filters.ts";
import type { ToolbarParts } from "./parts.ts";
import { SearchBox } from "./search-box.tsx";

interface GridToolbarProps {
  readonly layout: Layout;
  readonly fields: readonly SourceField[];
  readonly parts: ToolbarParts;
  readonly onChange: (layout: Layout) => void;
  readonly onExport: (format: ExportFormat) => void;
  /** The search box's input, which Ctrl+F in the grid focuses. */
  readonly searchRef: Ref<HTMLInputElement>;
}

/** What the search looks in, said on hover. */
function searchHint(layout: Layout, searched: readonly string[]): string {
  const names = searched.map((column) => layout.titles[column] ?? column);
  return names.length === 0 ? "Nothing here is text to search" : `Searches ${names.join(", ")}`;
}

/** Expand all and Collapse all, for a pivot's groups. */
function ExpandButtons({
  layout,
  onChange,
}: Pick<GridToolbarProps, "layout" | "onChange">): ReactNode {
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label="Expand all"
        onClick={() => {
          onChange(withAllExpanded(layout, true));
        }}
      >
        <ChevronsUpDownIcon />
        <span className="@max-xl:sr-only">Expand all</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-label="Collapse all"
        onClick={() => {
          onChange(withAllExpanded(layout, false));
        }}
      >
        <ChevronsDownUpIcon />
        <span className="@max-xl:sr-only">Collapse all</span>
      </Button>
    </>
  );
}

/** The grid's toolbar. */
function GridToolbar({
  layout,
  fields,
  parts,
  onChange,
  onExport,
  searchRef,
}: GridToolbarProps): ReactNode {
  const searched = searchColumns(layout, fields);
  // The search shows where there is text to search, and whenever a search is set, so that it can be cleared.
  const searchable = parts.search && (searched.length > 0 || layout.search !== "");
  // A pivot's groups open and close from here; a grid's, from its group panel.
  const expandable = parts.expand && layout.group_by.length > 0 && !layout.detail;
  return (
    <div
      role="toolbar"
      aria-label="Grid tools"
      className="@container flex flex-wrap items-center gap-1.5 border-b px-2 py-1.5"
    >
      {searchable ? (
        <SearchBox
          text={layout.search}
          hint={searchHint(layout, searched)}
          inputRef={searchRef}
          onChange={(text) => {
            onChange(withSearch(layout, text));
          }}
        />
      ) : null}
      {parts.chips ? <FilterChips layout={layout} onChange={onChange} /> : null}
      <span className="flex-1" />
      {expandable ? <ExpandButtons layout={layout} onChange={onChange} /> : null}
      <ColumnTools
        layout={layout}
        fields={fields}
        columns={parts.columns}
        totals={parts.totals}
        onChange={onChange}
      />
      {parts.export ? <ExportButton onExport={onExport} /> : null}
      {parts.maximize ? <MaximizeButton variant="outline" /> : null}
    </div>
  );
}

export { GridToolbar };
