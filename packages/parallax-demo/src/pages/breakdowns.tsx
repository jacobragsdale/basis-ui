/* The page of big charts. A click on a slice or bar narrows every other chart over the same dataset to that group; a
 * chart grouped by the same column keeps all its groups. The chip above the dataset's charts says what is picked and
 * clears it. */

import { Chart } from "@basis/parallax";
import type { ChartSelection } from "@basis/parallax";
import { Button, Card, CardContent, CardHeader, CardTitle, Page, XIcon } from "@basis/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import { useDemoDataset } from "#shell/datasets.ts";
import { pages } from "#shell/pages.ts";

import { breakdowns, narrowed } from "./breakdown-layouts.ts";
import type { Breakdown, Pick } from "./breakdown-layouts.ts";

type Of = Breakdown["dataset"];

/** Each dataset's picked group, if any, and how many times each chart has been drawn again from scratch: a chart
 * whose pick is cleared from its chip, or replaced by another chart's, starts again with nothing selected. */
interface Picks {
  readonly picked: Readonly<Record<Of, Pick | null>>;
  readonly generations: Readonly<Record<string, number>>;
}

const titles: Readonly<Record<Of, string>> = {
  positions: "150,000 positions, held in this page",
  trades: "150,000 trades, held in this page",
};

/** What a click made: the chart's selection, or null when it cleared it; `chart` is null for the chip's clearing. */
interface Picking {
  readonly chart: string | null;
  readonly selection: ChartSelection | null;
}

/** The picks after a click on `of`'s charts or chip. A chart picked before, other than the one clicked, starts
 * again. */
function picking(was: Picks, of: Of, { chart, selection }: Picking): Picks {
  const earlier = was.picked[of];
  const generations =
    earlier !== null && earlier.chart !== chart
      ? { ...was.generations, [earlier.chart]: (was.generations[earlier.chart] ?? 0) + 1 }
      : was.generations;
  const picked = chart === null || selection === null ? null : { chart, selection };
  return { generations, picked: { ...was.picked, [of]: picked } };
}

interface PartProps {
  readonly of: Of;
  readonly picks: Picks;
  readonly pick: (of: Of, picked: Picking) => void;
}

/** What a dataset's picked group is, with the chip that clears it. */
function PickChip({ of, picks, pick }: PartProps): ReactNode {
  const picked = picks.picked[of];
  if (picked === null) {
    return (
      <span className="text-xs font-normal text-muted-foreground">
        Click a slice or bar to narrow the others
      </span>
    );
  }
  const { column, label } = picked.selection;
  return (
    <Button
      size="xs"
      variant="secondary"
      aria-label={`Show every ${column} again`}
      onClick={() => {
        pick(of, { chart: null, selection: null });
      }}
    >
      {column}: {label}
      <XIcon />
    </Button>
  );
}

/** One dataset's breakdowns, under its heading. */
function Part({ of, picks, pick }: PartProps): ReactNode {
  const dataset = useDemoDataset(of);
  const picked = picks.picked[of];
  return (
    <div data-dataset={of} className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2.5 text-base font-semibold">
        {titles[of]}
        <PickChip of={of} picks={picks} pick={pick} />
      </h2>
      <div className="grid gap-3 xl:grid-cols-2">
        {breakdowns
          .filter((breakdown) => breakdown.dataset === of)
          .map((breakdown) => {
            const layout = narrowed(breakdown, picked);
            return (
              <Card
                key={`${breakdown.id}:${String(picks.generations[breakdown.id] ?? 0)}`}
                data-breakdown={breakdown.id}
                data-filtered={layout !== breakdown.layout}
                className="h-110"
              >
                <CardHeader>
                  <CardTitle>{breakdown.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col">
                  <Chart
                    className="min-h-0 flex-1"
                    dataset={dataset}
                    layout={{ ...layout, dataset: of }}
                    onSelect={(selection: ChartSelection | null) => {
                      pick(of, { chart: breakdown.id, selection });
                    }}
                  />
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}

function BreakdownsPage(): ReactNode {
  const [picks, setPicks] = useState<Picks>({
    generations: {},
    picked: { positions: null, trades: null },
  });
  const pick = (of: Of, picked: Picking): void => {
    setPicks((was) => picking(was, of, picked));
  };
  return (
    <Page title={pages.breakdowns.title} description={pages.breakdowns.about}>
      <div className="flex flex-col gap-5">
        <Part of="positions" picks={picks} pick={pick} />
        <Part of="trades" picks={picks} pick={pick} />
      </div>
    </Page>
  );
}

export { BreakdownsPage };
