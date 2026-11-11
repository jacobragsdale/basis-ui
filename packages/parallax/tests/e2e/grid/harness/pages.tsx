/* The harness's pages: one grid filling the page, of the positions' reference pivot or of the trades, and the small
 * tables, the book and the blotter side by side, each as tall as its rows up to a page. */

import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import { Grid, useDataset } from "#index.ts";
import type { GridHandle, LayoutInput } from "#index.ts";

import { blotter, book, datasets, referencePivot, richBook, sources } from "./data.ts";
import type { DatasetName } from "./data.ts";

/** How often the drawing counters are read, as the demo's performance overlay did. */
const sampleMs = 1000;
/** The tallest each small table grows to: a page of rows, whose toolbar and status bar stay in the window. */
const smallMaxHeight = 560;

/** The drawing counters of a grid, read once a second: its frames drawn, and how many of them drew everything. */
function Draws({ grid }: { readonly grid: RefObject<GridHandle | null> }): ReactNode {
  const [draws, setDraws] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      const stats = grid.current?.drawStats();
      setDraws(
        stats === undefined
          ? null
          : `${String(stats.frames)}, ${String(stats.fullDraws)} of them full`,
      );
    }, sampleMs);
    return (): void => {
      clearInterval(timer);
    };
  }, [grid]);
  return <output data-figure="draws">{draws ?? "n/a"}</output>;
}

/** The header: the page's controls, the layout of a page of one grid, and its drawing counters. */
function Header({
  children,
  layout,
  grid,
}: {
  readonly children: ReactNode;
  readonly layout: LayoutInput | null;
  readonly grid: RefObject<GridHandle | null> | null;
}): ReactNode {
  return (
    <header>
      <strong>parallax</strong>
      {children}
      {layout === null ? null : (
        <details>
          <summary>Layout</summary>
          <pre data-testid="layout-json">{JSON.stringify(layout, null, 2)}</pre>
        </details>
      )}
      {grid === null ? null : <Draws grid={grid} />}
    </header>
  );
}

/** A grid of one dataset, holding its layout as an app does. */
function DatasetGrid({
  name,
  first,
  height,
  grid,
  onLayout,
}: {
  readonly name: DatasetName;
  readonly first: LayoutInput;
  readonly height: "fill" | "auto";
  readonly grid?: RefObject<GridHandle | null>;
  readonly onLayout?: (layout: LayoutInput) => void;
}): ReactNode {
  const dataset = useDataset(name, sources[name], { primaryKey: datasets[name] });
  const [layout, setLayout] = useState(first);
  return (
    <Grid
      ref={grid}
      dataset={dataset}
      layout={layout}
      height={height}
      maxHeight={smallMaxHeight}
      onLayoutChange={(next) => {
        setLayout(next);
        onLayout?.(next);
      }}
    />
  );
}

/** One grid filling the page: the positions' reference pivot, or the trades. */
function SinglePage({
  preset,
  performance,
  children,
}: {
  readonly preset: "pivot" | "trades";
  readonly performance: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const first = preset === "pivot" ? referencePivot : { dataset: "trades" };
  const [layout, setLayout] = useState<LayoutInput>(first);
  const grid = useRef<GridHandle>(null);
  return (
    <>
      <Header layout={layout} grid={performance ? grid : null}>
        {children}
      </Header>
      <main data-preset="single">
        <DatasetGrid
          name={preset === "pivot" ? "positions" : "trades"}
          first={first}
          height="fill"
          grid={grid}
          onLayout={setLayout}
        />
      </main>
    </>
  );
}

/** The small tables: the book and the blotter, side by side. */
function SmallTables({
  performance,
  cells,
  children,
}: {
  readonly performance: boolean;
  readonly cells: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const grid = useRef<GridHandle>(null);
  return (
    <>
      <Header layout={null} grid={performance ? grid : null}>
        {children}
      </Header>
      <main data-preset="small">
        <section data-table="book">
          <h2>
            Book<span>300 positions, held in this page</span>
          </h2>
          <DatasetGrid name="book" first={cells ? richBook : book} height="auto" grid={grid} />
        </section>
        <section data-table="blotter">
          <h2>
            Blotter<span>500 trades, held in this page</span>
          </h2>
          <DatasetGrid name="blotter" first={blotter} height="auto" />
        </section>
      </main>
    </>
  );
}

export { SinglePage, SmallTables };
