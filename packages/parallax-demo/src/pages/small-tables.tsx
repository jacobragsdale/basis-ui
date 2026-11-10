/* Two small tables side by side: a few hundred rows, the size most tables are, each loaded into the page and run by
 * the WebAssembly engine. Each sizes itself to its rows, keeps its ticker pinned at the left and has a totals row: the
 * book's market value and P&L, which add, and the blotter's count of trades. Every change should feel instant at this
 * size, and the performance overlay times each one. */

import { Page } from "@basis/ui";
import { Grid } from "@basis/parallax";
import type { LayoutInput } from "@basis/parallax";
import { useState } from "react";
import type { ReactNode } from "react";

import { useDemoDataset } from "#shell/datasets.ts";
import { pages } from "#shell/pages.ts";
import { trackGrid } from "#tools/grid-stats.ts";

import { blotter, book } from "./small-table-layouts.ts";

/** The tallest each grid grows to: a page of rows, whose toolbar and status bar stay in the window. */
const tallest = 560;

/** A small table's heading: its name and what it holds. */
function TableHeading({
  name,
  holds,
}: {
  readonly name: string;
  readonly holds: string;
}): ReactNode {
  return (
    <h2 className="text-sm font-semibold">
      {name} <span className="font-normal text-muted-foreground">{holds}, held in this page</span>
    </h2>
  );
}

/** One small table, as tall as its rows up to a page. */
function SmallTable({
  name,
  first,
  holds,
}: {
  readonly name: "book" | "blotter";
  readonly first: LayoutInput;
  readonly holds: string;
}): ReactNode {
  const dataset = useDemoDataset(name);
  const [layout, setLayout] = useState(first);
  return (
    <section data-table={name} className="flex min-h-0 flex-col gap-1.5">
      <TableHeading name={name === "book" ? "Book" : "Blotter"} holds={holds} />
      <Grid
        ref={trackGrid(name)}
        dataset={dataset}
        layout={layout}
        onLayoutChange={setLayout}
        height="auto"
        maxHeight={tallest}
      />
    </section>
  );
}

function SmallTablesPage(): ReactNode {
  return (
    <Page title={pages.smallTables.title} description={pages.smallTables.about}>
      <div className="grid items-start gap-3 xl:grid-cols-2">
        <SmallTable name="book" first={book} holds="300 positions" />
        <SmallTable name="blotter" first={blotter} holds="500 trades" />
      </div>
    </Page>
  );
}

export { SmallTablesPage, TableHeading };
