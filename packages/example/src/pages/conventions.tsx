/* The list: the day count conventions the API accrues by, each with the days it counts in a year, under a filter bar
 * whose filters live in the page's address. */

import {
  ErrorAlert,
  FilterBar,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TypographyH1,
  TypographyLead,
  filterRows,
  useFilters,
  useTelemetry,
} from "@basis/ui";
import type { ReactElement } from "react";

import { useConventions } from "#api/client.ts";
import type { DayCount } from "#api/client.ts";

import { conventionFilters } from "./conventions-filters.ts";

function ConventionsTable({
  conventions,
}: {
  readonly conventions: readonly DayCount[];
}): ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Convention</TableHead>
          <TableHead variant="numeric">Days in a year</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {conventions.map(({ convention, year_days: yearDays }) => (
          <TableRow key={convention}>
            <TableCell>{convention}</TableCell>
            <TableCell variant="numeric">{yearDays}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ConventionsPage(): ReactElement {
  const conventions = useConventions();
  const filters = useFilters(conventionFilters);
  const telemetry = useTelemetry();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "conventions" });
  };
  return (
    <>
      <TypographyH1>Day count conventions</TypographyH1>
      <TypographyLead>How the API counts the days a coupon accrues over.</TypographyLead>
      <ErrorAlert
        error={conventions.error}
        onRetry={() => {
          conventions.refetch().catch(report);
        }}
      />
      <FilterBar filters={filters} label="Convention filters" />
      {conventions.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {conventions.data === undefined ? null : (
        <ConventionsTable
          conventions={filterRows(conventions.data.data, {
            fields: {
              convention: (row) => row.convention,
              days: (row) => String(row.year_days),
            },
            filters: conventionFilters,
            values: filters.values,
          })}
        />
      )}
    </>
  );
}

export { ConventionsPage };
