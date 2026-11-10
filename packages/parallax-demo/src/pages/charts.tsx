/* Every chart kind over the generated prices and positions, with the grids a brush on the candles and a click on the
 * donut narrow. */

import { Chart, Grid } from "@basis/parallax";
import type { ChartSelection, LayoutFilter, LayoutInput } from "@basis/parallax";
import { Card, CardContent, CardHeader, CardTitle, Page } from "@basis/ui";
import { cn } from "cn";
import { useState } from "react";
import type { ReactNode } from "react";

import { useDemoDataset } from "#shell/datasets.ts";
import { pages } from "#shell/pages.ts";

import { cards, qye } from "./chart-cards.ts";
import type { Card as ChartCard } from "./chart-cards.ts";
import { pickedFilter } from "./layouts.ts";

const allDays = "QYE's days, all of them until a range of candles is selected";
const allPositions = "Positions, all of them until a slice of the donut is selected";

/** QYE's days, narrowed to a brushed range. */
function daysLayout(brush: readonly LayoutFilter[]): LayoutInput {
  return {
    columns: ["date", "open", "high", "low", "close", "volume"],
    dataset: "prices",
    filters: [qye, ...brush],
    sort: [{ column: "date", descending: true }],
  };
}

/** Positions, narrowed to the asset class of a clicked slice. */
function positionsLayout(selected: ChartSelection | null): LayoutInput {
  return {
    columns: ["position_id", "fund", "asset_class", "ticker", "market_value_usd"],
    dataset: "positions",
    filters: selected === null ? [] : [pickedFilter(selected)],
    formats: { market_value_usd: { abbreviate: "millions" } },
  };
}

interface CardProps {
  readonly card: ChartCard;
  readonly onBrush?: (filters: readonly LayoutFilter[] | null) => void;
  readonly onSelect?: (selection: ChartSelection | null) => void;
}

/** One chart in its card; the technical-analysis card spans the page and two rows. */
function ChartTile({ card, onBrush, onSelect }: CardProps): ReactNode {
  const dataset = useDemoDataset(card.dataset);
  return (
    <Card
      size="sm"
      data-card={card.id}
      className={cn(card.id === "technical" ? "h-173 xl:col-span-2" : "h-85")}
    >
      <CardHeader>
        <CardTitle>{card.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <Chart
          className="min-h-0 flex-1"
          dataset={dataset}
          layout={{ ...card.layout, dataset: card.dataset }}
          {...(onBrush === undefined ? {} : { onBrush })}
          {...(onSelect === undefined ? {} : { onSelect })}
        />
      </CardContent>
    </Card>
  );
}

/** A grid that a chart beside it narrows, under its title. */
function LinkedGrid({
  linked,
  title,
  layout,
}: {
  readonly linked: string;
  readonly title: string;
  readonly layout: LayoutInput & { readonly dataset: "prices" | "positions" };
}): ReactNode {
  const dataset = useDemoDataset(layout.dataset);
  return (
    <section data-linked={linked} className="flex h-85 min-h-0 flex-col gap-1.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Grid dataset={dataset} layout={layout} toolbar={{ group: false }} />
    </section>
  );
}

function ChartsPage(): ReactNode {
  const [brush, setBrush] = useState<readonly LayoutFilter[] | null>(null);
  const [selected, setSelected] = useState<ChartSelection | null>(null);
  return (
    <Page title={pages.charts.title} description={pages.charts.about}>
      <div className="grid gap-3 xl:grid-cols-2">
        {cards.map((card) => {
          if (card.id === "candles") {
            return [
              <ChartTile key={card.id} card={card} onBrush={setBrush} />,
              <LinkedGrid
                key="candle-days"
                linked="candles"
                layout={{ ...daysLayout(brush ?? []), dataset: "prices" }}
                title={brush === null ? allDays : "QYE's days in the selected candles"}
              />,
            ];
          }
          if (card.id === "donut") {
            return [
              <ChartTile key={card.id} card={card} onSelect={setSelected} />,
              <LinkedGrid
                key="slice-positions"
                linked="donut"
                layout={{ ...positionsLayout(selected), dataset: "positions" }}
                title={
                  selected === null
                    ? allPositions
                    : `Positions in ${selected.label}, the slice selected`
                }
              />,
            ];
          }
          return <ChartTile key={card.id} card={card} />;
        })}
      </div>
    </Page>
  );
}

export { ChartsPage };
