/* The data page's position columns, shared by its DataTable examples and their tests: a link in each CUSIP cell, and
 * the numbers shown by their display formats, right-aligned in tabular figures, which the filter matches as shown.
 * Also the failure and the oversized data the states examples show. */

import { ApiError, Num } from "@basis/ui";
import type { DataTableColumn } from "@basis/ui";

import { positions } from "./fixtures.ts";
import type { Position } from "./fixtures.ts";

/** DataTable's cap of 2,000 rows, and one row past it. */
const rowCap = 2000;
const pastTheCap = rowCap + 1;

const positionColumns: readonly DataTableColumn<Position>[] = [
  {
    cell: (row) => (
      <a
        href={`#${row.cusip}`}
        className="font-mono text-primary underline-offset-4 hover:underline"
      >
        {row.cusip}
      </a>
    ),
    header: "CUSIP",
    hideable: false,
    id: "cusip",
    identifier: true,
    value: (row) => row.cusip,
  },
  { header: "Security", id: "security", value: (row) => row.security },
  { header: "Book", id: "book", value: (row) => row.book },
  {
    format: { decimals: 0, kind: "number" },
    header: "Par",
    id: "par",
    value: (row) => row.par,
    variant: "numeric",
  },
  {
    format: { kind: "price32", step: "eighth" },
    header: "Price",
    id: "price",
    value: (row) => row.price,
    variant: "numeric",
  },
  {
    cell: (row) => <Num value={row.change} signed />,
    header: "Change",
    id: "change",
    value: (row) => row.change,
    variant: "numeric",
  },
  { header: "Settled", id: "settled", value: (row) => row.settled },
  { header: "Note", id: "note", sortable: false, value: (row) => row.note },
];

const unavailableProblem = {
  detail: "The positions service did not answer in time.",
  status: 503,
  title: "Positions are unavailable",
  type: "upstream-unavailable",
};

/** What a positions query fails with when its service does not answer. */
const unavailable = new ApiError(
  unavailableProblem.status,
  unavailableProblem,
  unavailableProblem.title,
);

const manyPositions = Array.from(
  { length: pastTheCap },
  (_unused, index) => positions[index % positions.length],
).filter((row) => row !== undefined);

/** The positions at the row cap, each with its own id. */
const cappedPositions = Array.from({ length: rowCap }, (_unused, index) => index).flatMap(
  (index) => {
    const position = positions[index % positions.length];
    return position === undefined ? [] : [{ ...position, id: `p${String(index)}` }];
  },
);

export { cappedPositions, manyPositions, positionColumns, unavailable };
