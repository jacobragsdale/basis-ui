/* Import: trade tickets from a CSV file or an Excel workbook, each row checked against the ticket's schema before the
 * page takes it; the valid rows then show in a table. */

import { DataTable, FileImport, Page, amountSchema, parSuffixes } from "@basis/ui";
import { isCusip } from "@basis/ui/securities";
import type { DataTableColumn } from "@basis/ui";
import { useState } from "react";
import type { ReactElement } from "react";
import { z } from "zod";

const ticketRow = z.object({
  cusip: z
    .string()
    .refine(isCusip, { error: "is not a CUSIP: nine characters, the last its check digit" }),
  face: amountSchema(parSuffixes),
  price: z.coerce.number().positive(),
  side: z.enum(["Buy", "Sell"]),
});
type TicketRow = z.output<typeof ticketRow>;

const columns: readonly DataTableColumn<TicketRow & { readonly line: number }>[] = [
  { header: "Line", id: "line", value: (row) => row.line, variant: "numeric" },
  { header: "CUSIP", id: "cusip", value: (row) => row.cusip },
  { header: "Side", id: "side", value: (row) => row.side },
  {
    format: { currency: "USD", decimals: 0, kind: "money" },
    header: "Face",
    id: "face",
    value: (row) => row.face,
    variant: "numeric",
  },
  {
    format: { decimals: 4, kind: "price" },
    header: "Price",
    id: "price",
    value: (row) => row.price,
    variant: "numeric",
  },
];

function ImportPage(): ReactElement {
  const [rows, setRows] = useState<readonly (TicketRow & { readonly line: number })[]>([]);
  return (
    <Page
      title="Import tickets"
      description="A CSV or Excel workbook of tickets, with the columns CUSIP, Side, Face and Price, checked row by row."
    >
      <FileImport
        headers={{ cusip: ["CUSIP"], face: ["Face", "Par"], price: ["Price"], side: ["Side"] }}
        onImport={async (valid) => {
          setRows(valid.map((row, index) => ({ ...row, line: index + 1 })));
          await Promise.resolve();
        }}
        schema={ticketRow}
        title="Drop a CSV or Excel workbook of tickets here"
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.line)}
        label="Imported tickets"
      />
    </Page>
  );
}

export { ImportPage };
