/* Table and its parts, from shadcn's Base UI source (its base-nova style): a small DOM table for a few rows, such as a
 * card's top positions. Large, sortable or live data goes in parallax's grid, and rows with links and buttons in
 * DataTable. Two changes: TableHead and TableCell take `variant="numeric"`, right-aligned in tabular figures, and a
 * selected row takes the theme's `selection` colour rather than `muted`. */

import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { tableCellVariants, tableHeadVariants } from "./table-variants.ts";

/** A table in a container that scrolls sideways when the table is wider than its place.
 *
 * @example
 * ```tsx
 * import { Money, Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@basis/ui";
 *
 * <Table>
 *   <TableCaption>Largest positions</TableCaption>
 *   <TableHeader>
 *     <TableRow>
 *       <TableHead>CUSIP</TableHead>
 *       <TableHead>Market value</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     <TableRow>
 *       <TableCell>91282CRF0</TableCell>
 *       <TableCell>
 *         <Money value={4_975_000} />
 *       </TableCell>
 *     </TableRow>
 *   </TableBody>
 * </Table>;
 * ```
 */
function Table({ className, ...props }: ComponentProps<"table">): ReactElement {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

/** The table's header row group, holding its `TableHead` cells. */
function TableHeader({ className, ...props }: ComponentProps<"thead">): ReactElement {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

/** The table's rows. */
function TableBody({ className, ...props }: ComponentProps<"tbody">): ReactElement {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

/** The totals row or rows, on a muted band below the body. */
function TableFooter({ className, ...props }: ComponentProps<"tfoot">): ReactElement {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

/** A row. `data-state="selected"` marks it selected, in the theme's `selection` colour. */
function TableRow({ className, ...props }: ComponentProps<"tr">): ReactElement {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-selection",
        className,
      )}
      {...props}
    />
  );
}

/** A column heading; `variant="numeric"` for a column of numbers. */
function TableHead({
  className,
  variant = "default",
  ...props
}: ComponentProps<"th"> & VariantProps<typeof tableHeadVariants>): ReactElement {
  return (
    <th
      data-slot="table-head"
      data-variant={variant}
      className={cn(tableHeadVariants({ variant }), className)}
      {...props}
    />
  );
}

/** A cell; `variant="numeric"` for a number, so the column's digits line up. */
function TableCell({
  className,
  variant = "default",
  ...props
}: ComponentProps<"td"> & VariantProps<typeof tableCellVariants>): ReactElement {
  return (
    <td
      data-slot="table-cell"
      data-variant={variant}
      className={cn(tableCellVariants({ variant }), className)}
      {...props}
    />
  );
}

/** The table's caption, which names it for screen readers. */
function TableCaption({ className, ...props }: ComponentProps<"caption">): ReactElement {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
