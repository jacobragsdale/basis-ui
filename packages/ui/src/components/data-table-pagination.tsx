/* DataTable's pages, when it pages: which rows show, which page this is, and the buttons to the pages beside it. */

import type { RowData } from "@tanstack/react-table";
import type { ReactElement } from "react";

import { ChevronLeftIcon } from "#vendor/lucide/chevron-left.tsx";
import { ChevronRightIcon } from "#vendor/lucide/chevron-right.tsx";

import { Button } from "./button.tsx";
import type { DataTableInstance } from "./data-table-state.ts";

const counts = new Intl.NumberFormat("en-US");

interface DataTablePaginationProps {
  /** The table's name, which names its pages' navigation, as "Coupon schedule, pages", apart from the app's. */
  readonly label: string;
  /** The page showing, from 0. */
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly pageSize: number;
  /** How many rows the filter shows, across every page. */
  readonly rows: number;
  readonly onPrevious: (() => void) | undefined;
  readonly onNext: (() => void) | undefined;
}

/** The rows a page shows, as `Rows 26–50 of 120`. */
function rowsText(pageIndex: number, pageSize: number, rows: number): string {
  if (rows === 0) {
    return "No rows";
  }
  const first = pageIndex * pageSize + 1;
  const last = Math.min(rows, first + pageSize - 1);
  return `Rows ${counts.format(first)}–${counts.format(last)} of ${counts.format(rows)}`;
}

/** The line under a paged DataTable. A button is disabled at the end it would pass. */
function DataTablePagination({
  label,
  pageIndex,
  pageCount,
  pageSize,
  rows,
  onPrevious,
  onNext,
}: DataTablePaginationProps): ReactElement {
  return (
    <nav
      aria-label={`${label}, pages`}
      data-slot="data-table-pagination"
      className="flex flex-wrap items-center justify-end gap-2 text-sm text-muted-foreground tabular-nums"
    >
      <span>{rowsText(pageIndex, pageSize, rows)}</span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Previous page"
        disabled={onPrevious === undefined}
        onClick={onPrevious}
      >
        <ChevronLeftIcon />
      </Button>
      <span>{`Page ${counts.format(pageIndex + 1)} of ${counts.format(Math.max(pageCount, 1))}`}</span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Next page"
        disabled={onNext === undefined}
        onClick={onNext}
      >
        <ChevronRightIcon />
      </Button>
    </nav>
  );
}

/** The line under a paged table. */
function PaginationFor<TRow extends RowData>({
  label,
  table,
  pageSize,
}: {
  readonly label: string;
  readonly table: DataTableInstance<TRow>;
  readonly pageSize: number;
}): ReactElement {
  return (
    <DataTablePagination
      label={label}
      pageIndex={table.state.pagination.pageIndex}
      pageCount={table.getPageCount()}
      pageSize={pageSize}
      rows={table.getPrePaginatedRowModel().rows.length}
      onPrevious={
        table.getCanPreviousPage()
          ? () => {
              table.previousPage();
            }
          : undefined
      }
      onNext={
        table.getCanNextPage()
          ? () => {
              table.nextPage();
            }
          : undefined
      }
    />
  );
}

export { PaginationFor };
