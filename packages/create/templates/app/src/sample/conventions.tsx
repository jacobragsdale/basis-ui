/* The sample's list: the day count conventions basis's example API accrues by, each with the days it counts in a
 * year. Delete it with the rest of src/sample/ once the app calls its own API (AGENTS.md). */

import {
  ErrorAlert,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TypographyH1,
  TypographyLead,
  useTelemetry,
} from "@basis/ui";
import type { ReactElement } from "react";

import { useConventions } from "#api/client.ts";
import type { DayCount } from "#api/client.ts";

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
      {conventions.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {conventions.data === undefined ? null : (
        <ConventionsTable conventions={conventions.data.data} />
      )}
    </>
  );
}

export { ConventionsPage };
