/* The sample's second page: one bond's terms, as basis's example API holds them. Delete it with the rest of src/sample/
 * once the app calls its own API (AGENTS.md). */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorAlert,
  Pct,
  Skeleton,
  TypographyH1,
  useTelemetry,
} from "@basis/ui";
import { useParams } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { useBond } from "#api/client.ts";
import type { Bond } from "#api/client.ts";

function BondTerms({ bond }: { readonly bond: Bond }): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Terms</CardTitle>
        <CardDescription>
          Issued {bond.issued}, matures {bond.maturity}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-6">
          <dt className="text-muted-foreground">Coupon</dt>
          <dd>
            <Pct value={bond.coupon_rate} decimals={3} />
          </dd>
          <dt className="text-muted-foreground">Coupons a year</dt>
          <dd className="tabular-nums">{bond.frequency}</dd>
          <dt className="text-muted-foreground">Day count</dt>
          <dd>{bond.convention}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}

function BondPage(): ReactElement {
  const { security } = useParams({ from: "/bonds/$security" });
  const bond = useBond(security);
  const telemetry = useTelemetry();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "bond" });
  };
  return (
    <>
      <TypographyH1>Bond {security}</TypographyH1>
      <ErrorAlert
        error={bond.error}
        onRetry={() => {
          bond.refetch().catch(report);
        }}
      />
      {bond.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {bond.data === undefined ? null : <BondTerms bond={bond.data.data} />}
    </>
  );
}

export { BondPage };
