/* DataTable on the data page: a desk's Treasury positions, with a link in each CUSIP cell, numbers right-aligned in
 * tabular figures, selection, row actions, a click on a row and pages; the table at its row cap, its state held by the
 * page, in a box whose rows scroll under the header; then the table loading, empty, failed, and past its row cap. */

import { DataTable, numberText } from "@basis/ui";
import type { DataTableRowAction, DataTableSort } from "@basis/ui";
import { useState } from "react";
import type { ReactElement } from "react";

import { Demo } from "#pages/forms-and-inputs/demo.tsx";
import { Section } from "#pages/section.tsx";

import { cappedPositions, manyPositions, positionColumns, unavailable } from "./columns.tsx";
import { positions } from "./fixtures.ts";
import type { Position } from "./fixtures.ts";

/** Rows a page in the example, so its twelve positions take two pages. */
const pageSize = 8;

/** The desk's positions, with every feature on. */
function PositionsTable(): ReactElement {
  const [last, setLast] = useState("No action yet.");
  const actions = (row: Position): readonly DataTableRowAction[] => [
    {
      label: "View position",
      onSelect: () => {
        setLast(`Viewed ${row.cusip} in ${row.book}.`);
      },
    },
    {
      label: "Allocate",
      onSelect: () => {
        setLast(`Allocated ${row.cusip}.`);
      },
    },
    {
      disabled: !row.settled,
      label: "Close position",
      onSelect: () => {
        setLast(`Closed ${row.cusip} in ${row.book}.`);
      },
      variant: "destructive",
    },
  ];
  return (
    <div className="flex flex-col gap-2">
      <DataTable
        label="Positions"
        columns={positionColumns}
        data={positions}
        getRowId={(row) => row.id}
        rowLabel={(row) => `${row.cusip} in ${row.book}`}
        rowActions={actions}
        onRowClick={(row) => {
          setLast(`Opened ${row.cusip} in ${row.book}.`);
        }}
        selectable
        pageSize={pageSize}
      />
      <output className="text-sm text-muted-foreground">{last}</output>
    </div>
  );
}

function DataTableSection(): ReactElement {
  return (
    <Section
      title="DataTable"
      description="A table for small data whose cells hold links and buttons. A heading sorts its column, and Shift adds it to the sort; the filter searches the columns' values; rows select one at a time, as a range with Shift, or all at once; Copy puts the selection on the clipboard as TSV and Export CSV saves the rows the filter shows."
    >
      <PositionsTable />
    </Section>
  );
}

/** The state the page holds for the table at its row cap, in words. */
function stateText(sorting: readonly DataTableSort[], page: number, selected: number): string {
  const sorted = sorting.map(
    ({ id, desc = false }) => `${id} ${desc ? "descending" : "ascending"}`,
  );
  const count = numberText(selected, { decimals: 0 });
  return `Sorted by ${sorted.join(", ") || "nothing"}; page ${String(page + 1)}; ${count} selected.`;
}

/** The positions at the row cap, 50 a page, with the sort, filter, hidden columns, page and selection held here. */
function CappedPositions(): ReactElement {
  const [sorting, setSorting] = useState<readonly DataTableSort[]>([{ desc: true, id: "par" }]);
  const [filter, setFilter] = useState("");
  const [hidden, setHidden] = useState<readonly string[]>(["note"]);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<readonly string[]>([]);
  return (
    <div className="flex flex-col gap-2">
      <DataTable
        label="All positions, held by the page"
        columns={positionColumns}
        data={cappedPositions}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.cusip}
        selectable
        sorting={sorting}
        onSortingChange={setSorting}
        filter={filter}
        onFilterChange={setFilter}
        hiddenColumns={hidden}
        onHiddenColumnsChange={setHidden}
        page={page}
        onPageChange={setPage}
        selectedIds={selected}
        onSelectionChange={(_rows, ids) => {
          setSelected(ids);
        }}
        className="h-96"
      />
      <output className="text-sm text-muted-foreground">
        {stateText(sorting, page, selected.length)}
      </output>
    </div>
  );
}

function DataTableAtItsCapSection(): ReactElement {
  return (
    <Section
      title="DataTable at its row cap"
      description="2,000 positions, 50 a page, in a box of its own height whose rows scroll under the header. The page holds the sort, the filter, the columns hidden, the page and the selection, and says what they are."
    >
      <CappedPositions />
    </Section>
  );
}

function DataTableStatesSection(): ReactElement {
  return (
    <Section
      title="DataTable states"
      description="Loading, with placeholder rows; empty, saying so; failed, with the error read from problem details; and past its row cap, where it shows one error that sends the data to parallax's grid."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Demo label="loading">
          <DataTable
            label="Loading positions"
            columns={positionColumns}
            data={undefined}
            getRowId={(row) => row.id}
            loading
          />
        </Demo>
        <Demo label="empty">
          <DataTable
            label="Credit positions"
            columns={positionColumns}
            data={[]}
            getRowId={(row) => row.id}
            empty="The credit book holds nothing today."
          />
        </Demo>
        <Demo label="failed">
          <DataTable
            label="Agency positions"
            columns={positionColumns}
            data={undefined}
            getRowId={(row) => row.id}
            error={unavailable}
          />
        </Demo>
        <Demo label="past the row cap">
          <DataTable
            label="All positions"
            columns={positionColumns}
            data={manyPositions}
            getRowId={(row) => row.id}
          />
        </Demo>
      </div>
    </Section>
  );
}

export { DataTableAtItsCapSection, DataTableSection, DataTableStatesSection };
