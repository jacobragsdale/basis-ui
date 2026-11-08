/* The list: the day count conventions the API accrues by, each with the days it counts in a year, filtered by name
 * through the filter bar, with saved views, and the selected one's detail beside the list. */

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorAlert,
  FilterBar,
  SavedViews,
  Skeleton,
  SplitView,
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
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { useConventions } from "#api/client.ts";
import type { DayCount } from "#api/client.ts";

function ConventionsTable({
  conventions,
  onSelect,
}: {
  readonly conventions: readonly DayCount[];
  readonly onSelect: (convention: string) => void;
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
            <TableCell>
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  onSelect(convention);
                }}
              >
                {convention}
              </Button>
            </TableCell>
            <TableCell variant="numeric">{yearDays}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The selected convention, beside the list. */
function ConventionDetail({ convention }: { readonly convention: DayCount }): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{convention.convention}</CardTitle>
      </CardHeader>
      <CardContent>A year of {convention.year_days} days.</CardContent>
    </Card>
  );
}

/** The conventions page's route, for its search parameters. */
const conventionsRoute = getRouteApi("/");

/** The conventions whose names hold `text`, ignoring case. */
function matching(conventions: readonly DayCount[], text: string | undefined): readonly DayCount[] {
  const wanted = (text ?? "").toLowerCase();
  return conventions.filter(({ convention }) => convention.toLowerCase().includes(wanted));
}

/** The list and its selected convention, filtered by the address's search parameters. */
function ConventionsView({
  conventions,
}: {
  readonly conventions: readonly DayCount[];
}): ReactElement {
  const { convention, selected } = conventionsRoute.useSearch();
  const navigate = useNavigate({ from: "/" });
  const chosen = conventions.find((item) => item.convention === selected);
  const telemetry = useTelemetry();
  const report = (failure: unknown): void => {
    telemetry.error(failure, { source: "conventions" });
  };
  return (
    <SplitView
      id="conventions"
      detail={chosen === undefined ? null : <ConventionDetail convention={chosen} />}
    >
      <ConventionsTable
        conventions={matching(conventions, convention)}
        onSelect={(name) => {
          navigate({ search: (previous) => ({ ...previous, selected: name }) }).catch(report);
        }}
      />
    </SplitView>
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
      <div className="flex items-end justify-between gap-3">
        <FilterBar filters={[{ label: "Convention", name: "convention" }]} />
        <SavedViews />
      </div>
      {conventions.data === undefined ? null : (
        <ConventionsView conventions={conventions.data.data} />
      )}
    </>
  );
}

export { ConventionsPage };
