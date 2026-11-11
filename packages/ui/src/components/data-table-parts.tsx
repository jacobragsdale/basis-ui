/* DataTable's cells beyond the data: a heading that sorts, the selection checkboxes, and the rows that stand in while
 * the table loads or has nothing to show. Each takes plain values rather than TanStack's objects, whose methods read
 * state the React Compiler cannot see, so a part renders again whenever what it shows changes.
 *
 * A row's checkbox is the browser's own, drawn as Checkbox draws its box: Base UI's checkbox is the costliest part of a
 * row, and a table draws one a row. It is named, takes the focus, and toggles with Space, as Base UI's does. */

import type { ReactElement, ReactNode } from "react";

import { ArrowDownIcon } from "#vendor/lucide/arrow-down.tsx";
import { ArrowUpIcon } from "#vendor/lucide/arrow-up.tsx";
import { ArrowUpDownIcon } from "#vendor/lucide/arrow-up-down.tsx";
import { CheckIcon } from "#vendor/lucide/check.tsx";

import { Button } from "./button.tsx";
import { Checkbox } from "./checkbox.tsx";
import { isShiftEvent } from "./data-table-state.ts";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "./empty.tsx";
import { Skeleton } from "./skeleton.tsx";
import { TableCell, TableHead, TableRow } from "./table.tsx";
import { tableCellClasses } from "./table-variants.ts";

/** How many placeholder rows stand in while the table loads. */
const loadingRows = 5;

interface SortableHeadProps {
  readonly header: string;
  readonly numeric: boolean;
  readonly sortable: boolean;
  readonly sorted: false | "asc" | "desc";
  /** The column's place in a sort by several columns, from 1, or `undefined` while the sort has one column. It shows
   * beside the arrow; the button's name stays the heading, and the heading's `aria-sort` gives the direction. */
  readonly sortPosition: number | undefined;
  readonly onSort: ((event: unknown) => void) | undefined;
}

const ariaSort = { asc: "ascending", desc: "descending" } as const;

/** The arrow beside a heading: both ways while the column is unsorted, and the way it sorts once it is. */
function SortIcon({ sorted }: { readonly sorted: false | "asc" | "desc" }): ReactElement {
  if (sorted === "asc") {
    return <ArrowUpIcon />;
  }
  if (sorted === "desc") {
    return <ArrowDownIcon />;
  }
  return (
    <span className="flex text-muted-foreground">
      <ArrowUpDownIcon className="size-(--control-sm-icon)" />
    </span>
  );
}

/** A column heading. A sortable one is a button that sorts the column, and Shift adds it to the sort; a numeric one
 * puts its arrow first, so its text lines up with the numbers' right edge. */
function SortableHead({
  header,
  numeric,
  sortable,
  sorted,
  sortPosition,
  onSort,
}: SortableHeadProps): ReactElement {
  const variant = numeric ? "numeric" : "default";
  if (!sortable) {
    return (
      <TableHead scope="col" variant={variant}>
        {header}
      </TableHead>
    );
  }
  const icon = (
    <span data-icon={numeric ? "inline-start" : "inline-end"} className="flex items-center gap-0.5">
      <SortIcon sorted={sorted} />
      {sortPosition === undefined ? null : (
        <span aria-hidden="true" className="text-2xs tabular-nums">
          {sortPosition}
        </span>
      )}
    </span>
  );
  return (
    <TableHead
      scope="col"
      variant={variant}
      aria-sort={sorted === false ? undefined : ariaSort[sorted]}
    >
      <Button variant="ghost" onClick={onSort} className={numeric ? "-mr-2.5" : "-ml-2.5"}>
        {numeric ? icon : null}
        {header}
        {numeric ? null : icon}
      </Button>
    </TableHead>
  );
}

/** The heading's checkbox, which selects every row the filter shows, or clears them. */
function SelectAllHead({
  checked,
  indeterminate,
  onCheckedChange,
}: {
  readonly checked: boolean;
  readonly indeterminate: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <TableHead scope="col" className="w-0">
      <Checkbox
        aria-label="Select all rows"
        checked={checked}
        indeterminate={indeterminate}
        onCheckedChange={(next) => {
          onCheckedChange(next);
        }}
      />
    </TableHead>
  );
}

/** A row's checkbox, named after the row: the browser's own, under a box drawn as Checkbox's is, in a 24 px target.
 * Shift with a click selects the rows from the last one chosen. */
function SelectRowCell({
  label,
  checked,
  onToggle,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onToggle: (checked: boolean, shift: boolean) => void;
}): ReactElement {
  return (
    <td data-slot="table-cell" data-variant="default" className={tableCellClasses.checkbox}>
      <span className="relative inline-flex size-(--control-md-icon) min-h-target min-w-target shrink-0 items-center justify-center">
        <input
          type="checkbox"
          aria-label={`Select ${label}`}
          checked={checked}
          className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
          onChange={(event) => {
            onToggle(event.target.checked, isShiftEvent(event.nativeEvent));
          }}
        />
        <span
          data-slot="checkbox-box"
          aria-hidden="true"
          className="pointer-events-none flex size-(--control-md-icon) items-center justify-center rounded-sm border border-input text-primary-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:border-ring peer-focus-visible:outline peer-focus-visible:outline-offset-(--focus-offset) peer-focus-visible:outline-ring peer-focus-visible:outline-solid"
        >
          {checked ? <CheckIcon className="size-(--control-sm-icon)" /> : null}
        </span>
      </span>
    </td>
  );
}

/** Placeholder rows, a block in every cell, while the table loads. */
function LoadingRows({ columns }: { readonly columns: number }): ReactElement {
  const rows = Array.from({ length: loadingRows }, (_row, index) => index);
  const cells = Array.from({ length: columns }, (_cell, index) => index);
  return (
    <>
      {rows.map((row) => (
        <TableRow key={row} data-slot="data-table-loading-row">
          {cells.map((cell) => (
            <TableCell key={cell}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** One row across the table that says it has nothing to show, and what to do about it. */
function EmptyRow({
  columns,
  title,
  description,
  action,
}: {
  readonly columns: number;
  readonly title: string;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
}): ReactElement {
  return (
    <TableRow>
      <TableCell colSpan={columns} className="whitespace-normal">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{title}</EmptyTitle>
            {description === undefined ? null : <EmptyDescription>{description}</EmptyDescription>}
          </EmptyHeader>
          {action === undefined ? null : <EmptyContent>{action}</EmptyContent>}
        </Empty>
      </TableCell>
    </TableRow>
  );
}

export { EmptyRow, LoadingRows, SelectAllHead, SelectRowCell, SortableHead };
