/* The row a positions file must hold, as the data page's FileImport checks it. Each field reads the text a CSV cell
 * holds: the CUSIP is checked to its check digit, par reads as bond markets write it, where `M` is thousands, and the
 * price is decimal text, read as the number the API takes. */

import { amountSchema, parSuffixes } from "@basis/ui";
import type { ImportHeaders } from "@basis/ui";
import { isCusip } from "@basis/ui/securities";
import { z } from "zod";

const decimal = /^\d+(?:\.\d+)?$/u;

const positionImportRow = z.object({
  book: z.enum(["Rates", "Agency", "Credit"], "Use a book: Rates, Agency or Credit."),
  cusip: z.string().refine(isCusip, "Not a CUSIP: check its nine characters and its check digit."),
  note: z.string().optional(),
  par: amountSchema(parSuffixes),
  price: z
    .string()
    .regex(decimal, "Write the price as a decimal, such as 99.515625.")
    .transform(Number),
});

type ImportedPosition = z.output<typeof positionImportRow>;

/** The headers a positions file's columns may go by, besides their keys. */
const positionImportHeaders: ImportHeaders<typeof positionImportRow> = {
  book: "Book",
  cusip: "CUSIP",
  note: "Note",
  par: ["Par", "Par amount"],
  price: "Price",
};

export { positionImportHeaders, positionImportRow };
export type { ImportedPosition };
