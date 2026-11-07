/* FileImport on the data page: positions uploaded as CSV, mapped by their headers to a schema whose fields read text,
 * previewed with each refused cell's reason, and handed over, valid rows only, when the user confirms. */

import { FileImport } from "@basis/ui";
import { useState } from "react";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

import { positionImportHeaders, positionImportRow } from "./import-schema.ts";
import type { ImportedPosition } from "./import-schema.ts";

function FileImportSection(): ReactElement {
  const [received, setReceived] = useState<readonly ImportedPosition[]>([]);
  return (
    <Section
      title="FileImport"
      description="A drop zone and a file button for CSV. The file is read in the browser, its columns mapped by their headers to the app's Zod schema, and its rows previewed with each refused cell marked and its reason; confirming hands the app the valid rows, typed. An Excel workbook is refused with how to save it as CSV."
    >
      <FileImport
        title="Drop a positions file here"
        schema={positionImportRow}
        headers={positionImportHeaders}
        onImport={setReceived}
      />
      <output className="text-sm text-muted-foreground">
        {received.length === 0
          ? "No positions received yet."
          : `Received ${received.map((row) => `${row.cusip} ${row.par}`).join(", ")}.`}
      </output>
    </Section>
  );
}

export { FileImportSection };
