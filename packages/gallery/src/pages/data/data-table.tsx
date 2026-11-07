/* DataTable on the data page: a desk's Treasury positions, with a link in each CUSIP cell, numbers right-aligned in
 * tabular figures, selection, row actions and pages; then the table loading, empty, failed, and past its row cap. */

import { DataTable } from "@basis/ui";
import type { DataTableRowAction } from "@basis/ui";
import { useState } from "react";
import type { ReactElement } from "react";

import { Demo } from "#pages/forms-and-inputs/demo.tsx";
import { Section } from "#pages/section.tsx";

import { manyPositions, positionColumns, unavailable } from "./columns.tsx";
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

export { DataTableSection, DataTableStatesSection };
