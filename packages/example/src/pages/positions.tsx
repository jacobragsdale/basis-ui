/* The list: every position the API returns, each linking to its own page. */

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
  createFormatter,
  useTelemetry,
} from "@basis/ui";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { useGetPositions } from "#api/client.ts";
import type { Position } from "#api/client.ts";

const formatter = createFormatter();

function PositionsTable({ positions }: { readonly positions: readonly Position[] }): ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Book</TableHead>
          <TableHead variant="numeric">Quantity</TableHead>
          <TableHead variant="numeric">Price</TableHead>
          <TableHead>As of</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((position) => (
          <TableRow key={position.position_id}>
            <TableCell>
              <Link
                to="/positions/$positionId"
                params={{ positionId: String(position.position_id) }}
                className="font-medium underline-offset-4 hover:underline"
              >
                {position.symbol}
              </Link>
            </TableCell>
            <TableCell>{position.book}</TableCell>
            <TableCell variant="numeric">{formatter.integer(position.quantity)}</TableCell>
            <TableCell variant="numeric">{position.price}</TableCell>
            <TableCell>{position.as_of}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PositionsPage(): ReactElement {
  const positions = useGetPositions();
  const telemetry = useTelemetry();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "positions" });
  };
  return (
    <>
      <TypographyH1>Positions</TypographyH1>
      <ErrorAlert
        error={positions.error}
        onRetry={() => {
          positions.refetch().catch(report);
        }}
      />
      {positions.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {positions.data === undefined ? null : <PositionsTable positions={positions.data.data} />}
    </>
  );
}

export { PositionsPage };
