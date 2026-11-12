/* A bond: its terms in a description list, its price at the close in 32nds, and its coupon schedule. */

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  DescriptionList,
  ErrorAlert,
  Formatted,
  Page,
  Price32,
  Skeleton,
} from "@basis/ui";
import type { DataTableColumn } from "@basis/ui";
import { useParams } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { displayFormats, useBond, useCoupons } from "#api/client.ts";
import type { Bond, CouponRow } from "#api/client.ts";

const formats = displayFormats.Bond;

const couponColumns: readonly DataTableColumn<CouponRow>[] = [
  { header: "Accrues from", id: "accrual_start", value: (row) => row.accrual_start },
  { header: "Paid", id: "payment_date", value: (row) => row.payment_date },
  {
    format: displayFormats.CouponRow.rate,
    header: "Rate",
    id: "rate",
    value: (row) => row.rate,
    variant: "numeric",
  },
  {
    format: displayFormats.CouponRow.amount_per_100,
    header: "Per 100",
    id: "amount_per_100",
    value: (row) => row.amount_per_100,
    variant: "numeric",
  },
];

function Terms({ bond }: { readonly bond: Bond }): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Closed at <Price32 value={bond.price} precision="quarters" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DescriptionList
          columns={3}
          items={[
            { description: bond.issuer, term: "Issuer" },
            { description: `${bond.sector}, rated ${bond.rating}`, term: "Sector" },
            { description: bond.isin, term: "ISIN" },
            {
              description: <Formatted value={bond.coupon_rate} format={formats.coupon_rate} />,
              term: "Coupon",
            },
            { description: `${String(bond.frequency)} a year, ${bond.day_count}`, term: "Pays" },
            { description: `${bond.issued} to ${bond.maturity}`, term: "Term" },
            { description: <Formatted value={bond.yield} format={formats.yield} />, term: "Yield" },
            {
              description: <Formatted value={bond.spread} format={formats.spread} />,
              term: "Spread",
            },
            {
              description: <Formatted value={bond.duration} format={formats.duration} />,
              term: "Duration",
            },
            {
              description: (
                <Formatted value={bond.amount_outstanding} format={formats.amount_outstanding} />
              ),
              term: "Outstanding",
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function BondPage(): ReactElement {
  const { cusip } = useParams({ from: "/bonds/$cusip" });
  const bond = useBond(cusip);
  const coupons = useCoupons(cusip);
  return (
    <Page
      title={`Bond ${cusip}`}
      breadcrumb={bond.data?.data.issuer}
      description="Its terms, its close and its coupons."
    >
      <ErrorAlert error={bond.error} />
      {bond.data === undefined ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Terms bond={bond.data.data} />
      )}
      <DataTable
        columns={couponColumns}
        data={coupons.data?.data}
        error={coupons.error}
        getRowId={(row) => row.payment_date}
        label="Coupon schedule"
        loading={coupons.isPending}
      />
    </Page>
  );
}

export { BondPage };
