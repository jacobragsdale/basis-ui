/* Small charts over the two small tables, with their grids below. Clicking a bar or slice filters its table's grid to
 * that group, and clicking it again shows every row; Export writes what the grid shows. */

import { Chart, Grid } from "@basis/parallax";
import type { ChartSelection, LayoutInput } from "@basis/parallax";
import { Card, CardContent, CardHeader, CardTitle, Page } from "@basis/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import { datasetDates } from "#api/datasets.ts";
import { useDemoDataset } from "#shell/datasets.ts";
import { pages } from "#shell/pages.ts";

import { largestFirst, withSelection, withShare } from "./layouts.ts";
import { blotter, book } from "./small-table-layouts.ts";
import { TableHeading } from "./small-tables.tsx";

/** Which small table a tile charts, and so which grid its selection filters. */
type Table = "book" | "blotter";

/** A small chart on the dashboard. */
interface Tile {
  /** A name that stays when the title is reworded, such as for tests. */
  readonly id: string;
  readonly title: string;
  readonly table: Table;
  readonly layout: LayoutInput;
}

const millions = "millions";

// Short positions' market values are negative, which a pie refuses: gross notional is positive on both sides.
const tiles: readonly Tile[] = [
  {
    id: "asset-class",
    layout: {
      chart: { kind: "pie" },
      formats: { notional_usd: { abbreviate: millions } },
      group_by: ["asset_class"],
      group_sort: largestFirst,
      measures: withShare("notional_usd"),
    },
    table: "book",
    title: "Gross notional by asset class",
  },
  {
    id: "long-short",
    layout: {
      chart: { kind: "pie" },
      formats: { notional_usd: { abbreviate: millions } },
      group_by: ["long_short"],
      group_sort: largestFirst,
      measures: withShare("notional_usd"),
    },
    table: "book",
    title: "Gross notional, long against short",
  },
  {
    id: "pnl-by-fund",
    layout: {
      chart: { horizontal: true, kind: "bar" },
      formats: { daily_pnl_usd: { abbreviate: "thousands", negative: "parentheses" } },
      group_by: ["fund"],
      group_sort: largestFirst,
      measures: [{ aggregate: "sum", column: "daily_pnl_usd" }],
    },
    table: "book",
    title: "Daily P&L by fund",
  },
  {
    id: "mv-by-region",
    layout: {
      chart: { kind: "bar" },
      formats: { market_value_usd: { abbreviate: millions } },
      group_by: ["region"],
      group_sort: largestFirst,
      measures: [{ aggregate: "sum", column: "market_value_usd" }],
    },
    table: "book",
    title: "Market value by region",
  },
  {
    id: "trades-by-side",
    layout: {
      chart: { kind: "pie" },
      group_by: ["side"],
      group_sort: largestFirst,
      measures: withShare(null),
    },
    table: "blotter",
    title: "Blotter trades by side",
  },
];

/** One tile: its title and its chart, with no status line of its own. */
function DashboardTile({
  tile,
  onSelect,
}: {
  readonly tile: Tile;
  readonly onSelect: (tile: Tile, selection: ChartSelection | null) => void;
}): ReactNode {
  const dataset = useDemoDataset(tile.table);
  return (
    <Card size="sm" data-tile={tile.id} className="h-80">
      <CardHeader>
        <CardTitle>{tile.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <Chart
          className="min-h-0 flex-1"
          dataset={dataset}
          layout={{ ...tile.layout, dataset: tile.table }}
          status={false}
          onSelect={(selection) => {
            onSelect(tile, selection);
          }}
        />
      </CardContent>
    </Card>
  );
}

/** One of the small tables, under the tiles, filtered by what a tile selects. */
function DashboardGrid({
  name,
  holds,
  layout,
  onLayoutChange,
}: {
  readonly name: Table;
  readonly holds: string;
  readonly layout: LayoutInput;
  readonly onLayoutChange: (layout: LayoutInput) => void;
}): ReactNode {
  const dataset = useDemoDataset(name);
  return (
    <section data-table={name} className="flex min-h-120 flex-col gap-1.5">
      <TableHeading name={name === "book" ? "Book" : "Blotter"} holds={holds} />
      <Grid
        dataset={dataset}
        layout={layout}
        onLayoutChange={onLayoutChange}
        toolbar={{ group: false }}
        asOf={datasetDates[name]}
      />
    </section>
  );
}

function DashboardPage(): ReactNode {
  const [grids, setGrids] = useState<Readonly<Record<Table, LayoutInput>>>({ blotter, book });
  const select = (tile: Tile, selection: ChartSelection | null): void => {
    const column = selection?.column ?? tile.layout.group_by?.[0];
    if (column !== undefined) {
      setGrids((was) => ({
        ...was,
        [tile.table]: withSelection(was[tile.table], column, selection),
      }));
    }
  };
  return (
    <Page title={pages.dashboard.title} description={pages.dashboard.about}>
      <div className="grid gap-3 md:grid-cols-3 2xl:grid-cols-5">
        {tiles.map((tile) => (
          <DashboardTile key={tile.id} tile={tile} onSelect={select} />
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-5">
        <div className="flex flex-col xl:col-span-3">
          <DashboardGrid
            name="book"
            holds="300 positions"
            layout={grids.book}
            onLayoutChange={(layout) => {
              setGrids((was) => ({ ...was, book: layout }));
            }}
          />
        </div>
        <div className="flex flex-col xl:col-span-2">
          <DashboardGrid
            name="blotter"
            holds="500 trades"
            layout={grids.blotter}
            onLayoutChange={(layout) => {
              setGrids((was) => ({ ...was, blotter: layout }));
            }}
          />
        </div>
      </div>
    </Page>
  );
}

export { DashboardPage };
