/* The line under a grid that says where its numbers come from: the dataset, the rows shown, when the data is from,
 * values the load turned blank, and a failed refresh. Stale data is wrong data, so the bar never makes data look newer
 * than it is: it shows the date the page says the data is for, or else when the source was read and how long ago, and
 * with neither it shows no "as of" at all, never the time the browser loaded the table, which About this data lists
 * apart. While a first load arrives it says how many rows are still to come, so the rows so far, and what they sum
 * to, never read as the whole table; while a reload arrives, how far it has read. While numbers are selected it reads them as a spreadsheet's status bar does: their mean, smallest, largest,
 * sum and count. */

import { Badge, Button, InfoIcon, Popover, PopoverContent, PopoverTrigger } from "@basis/ui";
import { cn } from "cn";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import type { LoadProgress } from "#engine/limits.ts";
import type { TableStatus } from "#proto/parallax_pb.ts";
import type { Dataset } from "#react/use-dataset.ts";

import {
  asOfDate,
  asOfOf,
  asOfText,
  detailsOf,
  failedOf,
  loadingText,
  nansOf,
  rowsText,
} from "./status.ts";
import type { AsOf } from "./status.ts";
import type { Figure } from "./summary.ts";

/** How often the age is told again. */
const tickMs = 15_000;

interface StatusBarProps {
  /** The dataset: its name, and where its load stands while one is under way. */
  readonly dataset: Pick<Dataset, "name" | "progress">;
  /** Rows in the view, or null while it opens. */
  readonly viewRows: number | null;
  /** When the source was read, in microseconds since the epoch; 0 when the source gave no time. */
  readonly sourceAsOf: bigint | null;
  /** The date the data is for, as `YYYY-MM-DD`, as the page gives it; checked here, and one that is not a date shows
   * why in its place. */
  readonly asOf: string | undefined;
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

/** When the data is from: the page's date, or else when the source was read and how long ago; or, for a date that is
 * not one, why, in its place, as a layout the engine refuses shows its reason. */
function DataTime({
  date,
  read,
  now,
}: {
  readonly date: string | undefined;
  readonly read: AsOf | null;
  readonly now: number;
}): ReactNode {
  const checked = asOfDate(date);
  if (!checked.ok) {
    return (
      <output
        data-slot="grid-status-as-of-error"
        title={checked.reason}
        className="min-w-0 truncate text-destructive"
      >
        {checked.reason}
      </output>
    );
  }
  const dated = asOfText(checked.date, read, now);
  return dated === null ? null : (
    <span data-slot="grid-status-age" title={dated.title}>
      {dated.text}
    </span>
  );
}

/** The rows the view shows, and, while a load arrives, the rows still to come or how far a reload has read. */
function Rows({
  rows,
  progress,
}: {
  readonly rows: string;
  readonly progress: LoadProgress | null;
}): ReactNode {
  const loading = loadingText(progress);
  return (
    <>
      <span data-slot="grid-status-rows" className="tabular-nums">
        {rows}
      </span>
      {loading === null ? null : (
        <span data-slot="grid-status-loading" className="tabular-nums">
          {loading}
        </span>
      )}
    </>
  );
}

/** The grid's status bar. */
function StatusBar({
  dataset: { name: dataset, progress },
  viewRows,
  sourceAsOf,
  asOf: date,
  status,
  message,
  selectedRows,
  reading,
}: StatusBarProps): ReactNode {
  const now = useNow();
  const rows = rowsText(viewRows);
  const asOf = asOfOf(sourceAsOf);
  const nans = nansOf(status);
  const failed = failedOf(status);
  return (
    <div
      data-slot="grid-status"
      className="@container flex min-h-6 items-center gap-3 border-t bg-muted px-2 text-xs whitespace-nowrap text-muted-foreground"
    >
      <span data-slot="grid-status-dataset">{dataset}</span>
      <Rows rows={rows} progress={progress} />
      <Chosen count={selectedRows} />
      <DataTime date={date} read={asOf} now={now} />
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
      <output data-slot="grid-status-message" className="flex-1 truncate" title={message}>
        {message}
      </output>
      <Reading figures={reading} />
      <About items={detailsOf({ asOf, dataset, rows, status })} />
    </div>
  );
}

export { StatusBar };
