/* HeatCell on the small charts page: a DataTable of each book's monthly returns, each month's cell filled on the
 * diverging scale either side of zero, and its total on the sequential scale. */

import { DataTable, HeatCell, Num, Pct } from "@basis/ui";
import type { DataTableColumn } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

interface BookReturns {
  readonly book: string;
  readonly september: number;
  readonly october: number;
  readonly november: number;
  readonly assets: number;
}

const returns: readonly BookReturns[] = [
  { assets: 4200, book: "Rates", november: 0.004, october: -0.011, september: 0.018 },
  { assets: 2900, book: "Agency", november: 0.001, october: -0.004, september: 0.009 },
  { assets: 1700, book: "Credit", november: 0.022, october: 0.006, september: -0.027 },
  { assets: 600, book: "High yield", november: 0.041, october: -0.038, september: 0.012 },
];

/** Every month's returns share one domain, so their heat compares across the table. */
const monthDomain = { max: 0.04, min: -0.04, scale: "diverging" } as const;
const assetDomain = { max: 4200, min: 0, scale: "sequential" } as const;

const months = [
  ["september", "Sep"],
  ["october", "Oct"],
  ["november", "Nov"],
] as const;

const columns: readonly DataTableColumn<BookReturns>[] = [
  { header: "Book", id: "book", value: (row) => row.book },
  ...months.map(([month, header]): DataTableColumn<BookReturns> => ({
    cell: (row) => (
      <HeatCell value={row[month]} {...monthDomain}>
        <Pct value={row[month]} signed />
      </HeatCell>
    ),
    header,
    id: month,
    value: (row) => row[month],
    variant: "numeric",
  })),
  {
    cell: (row) => (
      <HeatCell value={row.assets} {...assetDomain}>
        <Num value={row.assets} decimals={0} />
      </HeatCell>
    ),
    header: "Assets ($m)",
    id: "assets",
    value: (row) => row.assets,
    variant: "numeric",
  },
];

function HeatCellSection(): ReactElement {
  return (
    <Section
      title="HeatCell"
      description="A value's heat behind its text, filling a DataTable's cell: returns either side of zero on the diverging scale, assets on the sequential, each with the ink that reads on its step."
    >
      <DataTable
        label="Returns by book"
        columns={columns}
        data={returns}
        getRowId={(row) => row.book}
        pageSize={10}
      />
    </Section>
  );
}

export { HeatCellSection };
