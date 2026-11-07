/* The charts page: every chart kind over the generated prices and positions, as in the Angular demo, with the views a
 * brush on the candles and a click on the donut narrow. */

import { cn } from "cn";
import { useState } from "react";
import type { ReactNode } from "react";

import { Chart, useDataset } from "#index.ts";
import type { ChartSelection, Dataset, LayoutFilter, LayoutInput } from "#index.ts";

import { datasetBytes, datasets } from "./api/datasets.ts";
import { cards, qye } from "./chart-cards.ts";
import type { Card } from "./chart-cards.ts";
import { LinkedRows } from "./linked-rows.tsx";

const prices = async (): Promise<ArrayBuffer> => datasetBytes("prices");
const positions = async (): Promise<ArrayBuffer> => datasetBytes("positions");

const allDays = "QYE's days, all of them until a range of candles is selected";
const allPositions = "Positions, all of them until a slice of the donut is selected";

/** QYE's days, narrowed to a brushed range. */
function daysLayout(brush: readonly LayoutFilter[]): LayoutInput {
  return {
    columns: ["date", "open", "high", "low", "close", "volume"],
    filters: [qye, ...brush],
    sort: [{ column: "date", descending: true }],
  };
}

/** Positions, narrowed to the asset class of a clicked slice. */
function positionsLayout(selected: ChartSelection | null): LayoutInput {
  return {
    columns: ["position_id", "fund", "asset_class", "ticker", "market_value_usd"],
    filters:
      selected === null ? [] : [{ column: selected.column, op: "eq", value: selected.value }],
  };
}

interface CardProps {
  readonly card: Card;
  readonly data: Dataset;
  readonly onBrush?: (filters: readonly LayoutFilter[] | null) => void;
  readonly onSelect?: (selection: ChartSelection | null) => void;
}

/** One chart in its card. */
function ChartCard({ card, data, onBrush, onSelect }: CardProps): ReactNode {
  const wide = card.id === "technical";
  return (
    <section
      data-card={card.id}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm",
        wide ? "col-span-2 h-173" : "h-85",
      )}
    >
      <h2 className="px-2.5 pt-2 text-sm font-semibold">{card.title}</h2>
      <Chart
        className="min-h-0 flex-1"
        dataset={data}
        layout={card.layout}
        {...(onBrush === undefined ? {} : { onBrush })}
        {...(onSelect === undefined ? {} : { onSelect })}
      />
    </section>
  );
}

interface LinkedProps {
  readonly card: Card;
  readonly data: Dataset;
  readonly days: Dataset;
  readonly positions: Dataset;
  readonly brush: readonly LayoutFilter[] | null;
  readonly handleBrush: (filters: readonly LayoutFilter[] | null) => void;
  readonly selected: ChartSelection | null;
  readonly handleSelect: (selection: ChartSelection | null) => void;
}

/** A card, followed by the view it narrows, if it narrows one. */
function ChartCardWithLinks(props: LinkedProps): ReactNode {
  const { card, data, brush, selected } = props;
  if (card.id === "candles") {
    return (
      <>
        <ChartCard card={card} data={data} onBrush={props.handleBrush} />
        <LinkedRows
          linked="candles"
          data={props.days}
          layout={daysLayout(brush ?? [])}
          title={brush === null ? allDays : "QYE's days in the selected candles"}
        />
      </>
    );
  }
  if (card.id === "donut") {
    return (
      <>
        <ChartCard card={card} data={data} onSelect={props.handleSelect} />
        <LinkedRows
          linked="donut"
          data={props.positions}
          layout={positionsLayout(selected)}
          title={
            selected === null ? allPositions : `Positions in ${selected.label}, the slice selected`
          }
        />
      </>
    );
  }
  return <ChartCard card={card} data={data} />;
}

/** Every chart kind, and the views two of them narrow. */
function ChartsPage(): ReactNode {
  const priceData = useDataset("prices", prices, { primaryKey: datasets.prices });
  const positionData = useDataset("positions", positions, { primaryKey: datasets.positions });
  const [brush, setBrush] = useState<readonly LayoutFilter[] | null>(null);
  const [selected, setSelected] = useState<ChartSelection | null>(null);
  return (
    <main className="grid grid-cols-2 gap-3 p-3">
      {cards.map((card) => (
        <ChartCardWithLinks
          key={card.id}
          card={card}
          data={card.dataset === "prices" ? priceData : positionData}
          brush={brush}
          handleBrush={setBrush}
          selected={selected}
          handleSelect={setSelected}
          days={priceData}
          positions={positionData}
        />
      ))}
    </main>
  );
}

export { ChartsPage };
