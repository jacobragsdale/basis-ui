/* The line under a grid that says where its numbers come from: the dataset, the rows shown, when the source was read
 * and how long ago, values the load turned blank, and a failed refresh. Stale data is wrong data, so the age is always
 * visible. */

import { Badge, Button, InfoIcon, Popover, PopoverContent, PopoverTrigger } from "@basis/ui";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import type { TableStatus } from "#proto/parallax_pb.ts";

import { ageText, asOfOf, detailsOf, failedOf, nansOf, rowsText } from "./status.ts";

/** How often the age is told again. */
const tickMs = 15_000;

interface StatusBarProps {
  readonly dataset: string;
  /** Rows in the view, or null while it opens. */
  readonly viewRows: number | null;
  /** When the source was read, in microseconds since the epoch; 0 when the source gave no time. */
  readonly sourceAsOf: bigint | null;
  readonly status: TableStatus | null;
  /** A short note, such as the result of a copy. */
  readonly message: string;
  /** How many rows are chosen, or null when the grid does not choose rows. */
  readonly selectedRows: number | null;
}

/** The time now, told again every few seconds, so an age stays current. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, tickMs);
    return (): void => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

/** What the status bar's About this data says. */
function About({
  items,
}: {
  readonly items: readonly { readonly term: string; readonly value: string }[];
}): ReactNode {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label="About this data" />}
      >
        <InfoIcon />
      </PopoverTrigger>
      <PopoverContent side="top" align="end" aria-label="About this data" className="w-auto">
        <dl data-slot="grid-about" className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {items.map((item) => (
            <div key={item.term} className="contents">
              <dt className="text-muted-foreground">{item.term}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

/** The grid's status bar. */
function StatusBar({
  dataset,
  viewRows,
  sourceAsOf,
  status,
  message,
  selectedRows,
}: StatusBarProps): ReactNode {
  const now = useNow();
  const rows = rowsText(viewRows);
  const asOf = asOfOf(sourceAsOf, status);
  const nans = nansOf(status);
  const failed = failedOf(status);
  return (
    <div
      data-slot="grid-status"
      className="flex min-h-6 items-center gap-3 border-t bg-muted px-2 text-xs whitespace-nowrap text-muted-foreground"
    >
      <span data-slot="grid-status-dataset">{dataset}</span>
      <span data-slot="grid-status-rows" className="tabular-nums">
        {rows}
      </span>
      {selectedRows === null || selectedRows === 0 ? null : (
        <span data-slot="grid-status-selected" className="tabular-nums text-foreground">
          {`${selectedRows.toLocaleString("en-US")} selected`}
        </span>
      )}
      {asOf === null ? null : (
        <span data-slot="grid-status-age" title={`Source read at ${asOf.time} New York time`}>
          as of {asOf.time} · {ageText(now - asOf.ms)}
        </span>
      )}
      {nans === null ? null : (
        <Badge variant="warning" title={nans.title}>
          {nans.text}
        </Badge>
      )}
      {failed === null ? null : (
        <Badge variant="destructive" title={failed.title} render={<output />}>
          {failed.text}
        </Badge>
      )}
      <output data-slot="grid-status-message" className="flex-1 truncate">
        {message}
      </output>
      <About items={detailsOf({ asOf, dataset, rows, status })} />
    </div>
  );
}

export { StatusBar };
