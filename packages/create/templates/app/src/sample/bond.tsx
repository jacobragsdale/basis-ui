/* The sample's second page: one bond's terms, as basis's example API holds them. Delete it with the rest of src/sample/
 * once the app calls its own API (AGENTS.md). */

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DescriptionList,
  ErrorAlert,
  Page,
  Pct,
  Skeleton,
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
      </CardHeader>
      <CardContent>
        <DescriptionList
          columns={3}
          items={[
            { description: <Pct value={bond.coupon_rate} decimals={3} />, term: "Coupon" },
            { description: bond.frequency, term: "Coupons a year" },
            { description: bond.convention, term: "Day count" },
            { description: bond.issued, term: "Issued" },
            { description: bond.maturity, term: "Matures" },
          ]}
        />
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
    <Page title={`Bond ${security}`} breadcrumb={security}>
      <ErrorAlert
        error={bond.error}
        onRetry={() => {
          bond.refetch().catch(report);
        }}
      />
      {bond.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {bond.data === undefined ? null : <BondTerms bond={bond.data.data} />}
    </Page>
  );
}

export { BondPage };
