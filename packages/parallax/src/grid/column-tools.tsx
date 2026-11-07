/* The toolbar's Columns, which opens the column chooser, and Totals, which turns the totals row on and off. */

import {
  Button,
  Columns3Icon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SigmaIcon,
  Toggle,
} from "@basis/ui";
import type { ReactNode } from "react";

import type { Layout } from "#layout/layout.ts";

import { ColumnChooser } from "./column-chooser.tsx";
import { defaultTotals } from "./edit.ts";
import type { SourceField } from "./fields.ts";

interface ColumnToolsProps {
  readonly layout: Layout;
  readonly fields: readonly SourceField[];
  /** Whether Columns shows. */
  readonly columns: boolean;
  /** Whether Totals shows. */
  readonly totals: boolean;
  readonly onChange: (layout: Layout) => void;
}

/** Columns and Totals. */
function ColumnTools({ layout, fields, columns, totals, onChange }: ColumnToolsProps): ReactNode {
  const totalled = layout.totals.length > 0;
  return (
    <>
      {columns ? (
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" aria-label="Columns" />}>
            <Columns3Icon />
            <span className="@max-xl:sr-only">Columns</span>
          </PopoverTrigger>
          <PopoverContent align="end" aria-label="Columns">
            <ColumnChooser layout={layout} fields={fields} onChange={onChange} />
          </PopoverContent>
        </Popover>
      ) : null}
      {totals ? (
        <Toggle
          variant="outline"
          size="sm"
          pressed={totalled}
          title="A totals row under the rows; each column's total is in its menu"
          aria-label="Totals"
          onPressedChange={() => {
            onChange(totalled ? { ...layout, totals: [] } : defaultTotals(layout, fields));
          }}
        >
          <SigmaIcon />
          <span className="@max-xl:sr-only">Totals</span>
        </Toggle>
      ) : null}
    </>
  );
}

export { ColumnTools };
