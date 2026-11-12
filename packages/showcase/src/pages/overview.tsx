/* The overview: the desk's day in KPI cards with their trends, P&L by fund, exposure by sector and by rating as bar
 * charts of the rows the API sent, and the day's alerts. */

import { Chart } from "@basis/parallax";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorAlert,
  Money,
  Page,
  Skeleton,
  StatCard,
  useTelemetry,
} from "@basis/ui";
import type { ReactElement } from "react";

import { useOverview } from "#api/client.ts";
import type { Alert as DeskAlert, Exposure, Kpi, Overview } from "#api/client.ts";

const alertVariants = { critical: "destructive", info: "info", warning: "warning" } as const;

/** How each figure abbreviates: the book's value in billions, the rest in millions. */
const abbreviations: Readonly<Record<string, "B" | "M">> = { market_value: "B" };

function KpiCard({ kpi }: { readonly kpi: Kpi }): ReactElement {
  return (
    <StatCard
      label={kpi.label}
      value={<Money value={kpi.value} abbreviate={abbreviations[kpi.id] ?? "M"} />}
      change={{ label: "on the day", value: kpi.change }}
      trend={kpi.trend}
      trendLabel={`${kpi.label} over the last 20 days`}
    />
  );
}

function BarCard({
  title,
  rows,
  x,
  y,
}: {
  readonly title: string;
  readonly rows: readonly Readonly<Record<string, number | string>>[];
  readonly x: string;
  readonly y: string;
}): ReactElement {
  return (
    <Card size="sm" className="h-80">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <Chart
          className="min-h-0 flex-1"
          formats={{ [y]: { abbreviate: "millions", decimals: 1 } }}
          kind="bar"
          name={title}
          rows={rows}
          x={x}
          y={y}
        />
      </CardContent>
    </Card>
  );
}

function byValue(rows: readonly Exposure[]): readonly Exposure[] {
  return rows.toSorted((left, right) => right.market_value_usd - left.market_value_usd);
}

function OverviewBody({ overview }: { readonly overview: Overview }): ReactElement {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {overview.kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <BarCard title="P&L by fund" rows={overview.pnl_by_fund} x="fund" y="pnl_usd" />
        <BarCard
          title="Exposure by sector"
          rows={byValue(overview.exposure_by_sector)}
          x="group"
          y="market_value_usd"
        />
        <BarCard
          title="Exposure by rating"
          rows={byValue(overview.exposure_by_rating)}
          x="group"
          y="market_value_usd"
        />
      </div>
      <section aria-label="Alerts" className="flex flex-col gap-2">
        {overview.alerts.map((alert: DeskAlert) => (
          <Alert key={alert.id} variant={alertVariants[alert.severity]}>
            <AlertTitle>{alert.title}</AlertTitle>
            <AlertDescription>{alert.detail}</AlertDescription>
          </Alert>
        ))}
      </section>
    </>
  );
}

function OverviewPage(): ReactElement {
  const overview = useOverview();
  const telemetry = useTelemetry();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "overview" });
  };
  return (
    <Page
      title="Overview"
      description="The desk's day on 30 October: its figures, P&L, exposure and alerts."
    >
      <ErrorAlert
        error={overview.error}
        onRetry={() => {
          overview.refetch().catch(report);
        }}
      />
      {overview.data === undefined ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <OverviewBody overview={overview.data.data} />
      )}
    </Page>
  );
}

export { OverviewPage };
