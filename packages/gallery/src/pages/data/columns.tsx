/* The data page's position columns, shared by its DataTable examples and their tests: a link in each CUSIP cell, and
 * the numbers drawn by the formatter, right-aligned in tabular figures. Also the failure and the oversized data the
 * states examples show. */

import { ApiError, Num, Price32 } from "@basis/ui";
import type { DataTableColumn } from "@basis/ui";

import { positions } from "./fixtures.ts";
import type { Position } from "./fixtures.ts";

/** One row past DataTable's cap of 2,000. */
const pastTheCap = 2001;

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
    value: (row) => row.cusip,
  },
  { header: "Security", id: "security", value: (row) => row.security },
  { header: "Book", id: "book", value: (row) => row.book },
  {
    cell: (row) => <Num value={row.par} decimals={0} />,
    header: "Par",
    id: "par",
    value: (row) => row.par,
    variant: "numeric",
  },
  {
    cell: (row) => <Price32 value={row.price} />,
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

export { manyPositions, positionColumns, unavailable };
