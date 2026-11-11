/* The small charts and query states family: StatCard, a dashboard's figure, Sparkline on KPI cards, CellBar in a table's cells, and QueryState in each
 * of a query's states, loading, failed, empty, current and stale. */

import { Bps, CellBar, Money, QueryState, Sparkline, StatCard } from "@basis/ui";
import type { QueryLike } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

/** Ten days of a series, written as the values separated by spaces, "-" where a day is missing. */
function days(written: string): readonly (number | null)[] {
  return written.split(" ").map((value) => (value === "-" ? null : Number(value)));
}

const navDays = days("101.2 101.5 101.1 101.7 102 102.4 102.1 102.8 103 103.3");
const spreadDays = days("1.42 1.45 1.47 - 1.51 1.49 1.55 1.58 1.57 1.61");
const pnlDays = days("4.1 3.8 3.9 3.2 3.4 2.9 2.6 2.8 2.1 1.9");

/** A sector's exposure and P&L, as a table's rows hold them. */
const sectors = [
  { exposure: 42_500_000, name: "Financials", pnl: 1_250_000 },
  { exposure: 18_000_000, name: "Utilities", pnl: -640_000 },
  { exposure: 27_300_000, name: "Energy", pnl: 310_000 },
  { exposure: 9_800_000, name: "Technology", pnl: -1_480_000 },
] as const;
const largestExposure = Math.max(...sectors.map((sector) => sector.exposure));
const largestPnl = Math.max(...sectors.map((sector) => Math.abs(sector.pnl)));

const minuteMs = 60_000;
/** How long ago the stale example's data was fetched, in minutes: past its fifteen. */
const staleMinutes = 45;

/** A query in one state, as useQuery gives it. */
function queryOf<TData>(state: Partial<QueryLike<TData>>): QueryLike<TData> {
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error: null,
    isPending: false,
    refetch: () => null,
    ...state,
  };
}

const states: readonly { readonly name: string; readonly query: QueryLike<readonly string[]> }[] = [
  { name: "loading", query: queryOf({ isPending: true }) },
  {
    name: "failed",
    query: queryOf({ error: new Error("The positions service did not answer in time.") }),
  },
  { name: "empty", query: queryOf({ data: [], dataUpdatedAt: Date.now() }) },
  {
    name: "current",
    query: queryOf({ data: ["912828C57", "037833100"], dataUpdatedAt: Date.now() - minuteMs }),
  },
  {
    name: "stale",
    query: queryOf({ data: ["912828C57"], dataUpdatedAt: Date.now() - staleMinutes * minuteMs }),
  },
];

function StatCardSection(): ReactElement {
  return (
    <Section
      title="StatCard"
      description="A dashboard's figure: its value in large tabular figures, its change with an arrow, a sign and a colour, and its recent values; a rising spread takes the loss colour, and a card loads as a skeleton."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="NAV"
          value={<Money value={1_284_500_000} currency="USD" abbreviate="M" />}
          change={{ label: "vs yesterday", value: 0.021 }}
          trend={navDays}
          trendLabel="NAV over the last ten days, rising"
          footnote="As of the 4:00 p.m. close"
        />
        <StatCard
          label="Credit spread"
          value={<Bps value={0.0161} decimals={0} />}
          change={{ as: "bps", decimals: 0, label: "this week", rising: "loss", value: 0.0019 }}
          trend={spreadDays}
          trendLabel="Spread over the last ten days, widening"
        />
        <StatCard
          label="Day's P&L"
          value={<Money value={-1_900_000} currency="USD" abbreviate="M" signed />}
          change={{ label: "vs the 10-day average", value: -0.24 }}
          trend={pnlDays}
          trendLabel="P&L over the last ten days, falling"
        />
        <StatCard label="Open orders" value="—" trend={navDays} loading />
      </div>
    </Section>
  );
}

function SparklineSection(): ReactElement {
  return (
    <Section
      title="Sparkline"
      description="A series too small for parallax, such as a KPI card's last ten days. A missing value breaks the line; with trend it takes the gain or loss colour."
    >
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2 text-sm">
          NAV <Sparkline label="NAV over ten days, up" values={navDays} trend area />
        </div>
        <div className="flex items-center gap-2 text-sm">
          Spread, a day missing, a rise a loss
          <Sparkline label="Spread over ten days, up" values={spreadDays} trend rising="loss" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          P&amp;L <Sparkline label="P&L over ten days, down" values={pnlDays} trend />
        </div>
        <span className="text-chart-2">
          <Sparkline
            label="NAV, larger, in its text's colour"
            values={navDays}
            className="h-10 w-48"
          />
        </span>
      </div>
    </Section>
  );
}

function CellBarSection(): ReactElement {
  return (
    <Section
      title="CellBar"
      description="A value's bar behind its text in a table's cell, as a share of its column's largest; a signed column's bars grow both ways from the middle."
    >
      <table className="w-full max-w-xl text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="font-medium">Sector</th>
            <th className="text-right font-medium">Exposure</th>
            <th className="text-right font-medium">P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {sectors.map((sector) => (
            <tr key={sector.name}>
              <td>{sector.name}</td>
              <td>
                <CellBar value={sector.exposure} max={largestExposure}>
                  <Money value={sector.exposure} currency="USD" />
                </CellBar>
              </td>
              <td>
                <CellBar value={sector.pnl} max={largestPnl} signed>
                  <Money value={sector.pnl} currency="USD" />
                </CellBar>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function QueryStateSection(): ReactElement {
  return (
    <Section
      title="QueryState"
      description="Every state of a query's data: a skeleton while it loads, the API's problem with a retry, an empty state, and the data under the time it was current, in the warning colour once stale."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {states.map(({ name, query }) => (
          <div
            key={name}
            data-state-example={name}
            className="flex flex-col gap-1 rounded-lg border p-3"
          >
            <span className="text-xs text-muted-foreground">{name}</span>
            <QueryState
              query={query}
              emptyTitle="No positions"
              emptyDescription="Positions booked today show here."
              staleAfter={{ minutes: 15 }}
            >
              {(rows) => (
                <ul className="text-sm">
                  {rows.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              )}
            </QueryState>
          </div>
        ))}
      </div>
    </Section>
  );
}

function SmallChartsAndStates(): ReactElement {
  return (
    <>
      <StatCardSection />
      <SparklineSection />
      <CellBarSection />
      <QueryStateSection />
    </>
  );
}

export { SmallChartsAndStates };
