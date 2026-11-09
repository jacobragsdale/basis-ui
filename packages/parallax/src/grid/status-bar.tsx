/* The line under a grid that says where its numbers come from: the dataset, the rows shown, when the source was read
 * and how long ago, values the load turned blank, and a failed refresh. Stale data is wrong data, so the age is always
 * visible. While numbers are selected it reads them as a spreadsheet's status bar does: their mean, smallest, largest,
 * sum and count. */

import { Badge, Button, InfoIcon, Popover, PopoverContent, PopoverTrigger } from "@basis/ui";
import { cn } from "cn";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import type { TableStatus } from "#proto/parallax_pb.ts";

import { ageText, asOfOf, detailsOf, failedOf, nansOf, rowsText } from "./status.ts";
import type { Figure } from "./summary.ts";

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
  /** The reading of the numbers selected; empty for none. */
  readonly reading: readonly Figure[];
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

/** The reading of the numbers selected, each figure's value in the text colour beside its muted name. A narrower
 * status bar drops the extremes, then the count, then the mean, and keeps the sum; the whole reading is its title,
 * and what a screen reader reads. */
function Reading({ figures }: { readonly figures: readonly Figure[] }): ReactNode {
  if (figures.length === 0) {
    return null;
  }
  const spoken = figures.map((figure) => `${figure.label} ${figure.value}`).join(", ");
  return (
    <output
      data-slot="grid-status-reading"
      aria-label="Selected numbers"
      title={spoken}
      className="flex min-w-0 gap-2.5 overflow-hidden tabular-nums"
    >
      <span className="sr-only">{spoken}</span>
      {figures.map((figure) => (
        <span
          key={figure.label}
          aria-hidden="true"
          className={cn(
            "shrink-0",
            figure.from === "small" && "@max-2xl:hidden",
            figure.from === "medium" && "@max-3xl:hidden",
            figure.from === "wide" && "@max-4xl:hidden",
          )}
        >
          {figure.label} <span className="text-foreground">{figure.value}</span>
        </span>
      ))}
    </output>
  );
}

/** How many rows are chosen, when any are. */
function Chosen({ count }: { readonly count: number | null }): ReactNode {
  return count === null || count === 0 ? null : (
    <span data-slot="grid-status-selected" className="text-foreground tabular-nums">
      {`${count.toLocaleString("en-US")} selected`}
    </span>
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
  reading,
}: StatusBarProps): ReactNode {
  const now = useNow();
  const rows = rowsText(viewRows);
  const asOf = asOfOf(sourceAsOf, status);
  const nans = nansOf(status);
  const failed = failedOf(status);
  return (
    <div
      data-slot="grid-status"
      className="@container flex min-h-6 items-center gap-3 border-t bg-muted px-2 text-xs whitespace-nowrap text-muted-foreground"
    >
      <span data-slot="grid-status-dataset">{dataset}</span>
      <span data-slot="grid-status-rows" className="tabular-nums">
        {rows}
      </span>
      <Chosen count={selectedRows} />
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
      <Reading figures={reading} />
      <About items={detailsOf({ asOf, dataset, rows, status })} />
    </div>
  );
}

export { StatusBar };
