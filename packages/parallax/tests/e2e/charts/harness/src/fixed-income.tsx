/* The fixed-income page: the views roadmap step 2.8 adds, over a book of bonds, with the bonds a click on the
 * relative-value scatter narrows. */

import { useState } from "react";
import type { ReactNode } from "react";

import { Chart, useDataset } from "#index.ts";
import type { ChartSelection, Dataset, LayoutInput } from "#index.ts";

import { datasetBytes, datasets } from "./api/datasets.ts";
import { fixedIncomeCards } from "./fixed-income-cards.ts";
import type { FixedIncomeCard } from "./fixed-income-cards.ts";
import { LinkedRows } from "./linked-rows.tsx";

const bonds = async (): Promise<ArrayBuffer> => datasetBytes("bonds");

/** The bonds, narrowed to the one clicked. */
function bondsLayout(selected: ChartSelection | null): LayoutInput {
  return {
    columns: ["cusip", "issuer", "sector", "rating", "spread", "rich_cheap"],
    filters:
      selected === null ? [] : [{ column: selected.column, op: "eq", value: selected.value }],
  };
}

interface CardProps {
  readonly card: FixedIncomeCard;
  readonly data: Dataset;
  readonly onSelect?: (selection: ChartSelection | null) => void;
}

/** One chart in its card. */
function FixedIncomeChart({ card, data, onSelect }: CardProps): ReactNode {
  return (
    <section
      data-card={card.id}
      className="flex h-110 min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <h2 className="px-2.5 pt-2 text-sm font-semibold">{card.title}</h2>
      <Chart
        className="min-h-0 flex-1"
        dataset={data}
        layout={card.layout}
        {...(onSelect === undefined ? {} : { onSelect })}
      />
    </section>
  );
}

interface ScatterProps extends CardProps {
  readonly selected: ChartSelection | null;
  readonly onSelect: (selection: ChartSelection | null) => void;
}

/** The relative-value scatter, and the bonds a click on it narrows. */
function FixedIncomeScatter({ card, data, selected, onSelect }: ScatterProps): ReactNode {
  return (
    <>
      <FixedIncomeChart card={card} data={data} onSelect={onSelect} />
      <LinkedRows
        linked="rich-cheap"
        data={data}
        layout={bondsLayout(selected)}
        title={
          selected === null ? "Bonds, all of them until one is clicked" : `Bond ${selected.label}`
        }
      />
    </>
  );
}

/** Every fixed-income card, and the bonds the scatter's click narrows. */
function FixedIncomePage(): ReactNode {
  const bondData = useDataset("bonds", bonds, { primaryKey: datasets.bonds });
  const [selected, setSelected] = useState<ChartSelection | null>(null);
  return (
    <main className="grid grid-cols-2 gap-3 p-3">
      {fixedIncomeCards.map((card) =>
        card.id === "rich-cheap" ? (
          <FixedIncomeScatter
            key={card.id}
            card={card}
            data={bondData}
            selected={selected}
            onSelect={setSelected}
          />
        ) : (
          <FixedIncomeChart key={card.id} card={card} data={bondData} />
        ),
      )}
    </main>
  );
}

export { FixedIncomePage };
