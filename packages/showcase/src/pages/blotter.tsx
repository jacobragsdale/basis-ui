/* The blotter: 1,000,000 trades on the grid, filtered by the FilterBar in the address, its sort and groups saved as
 * views, its cells drawn as badges and bars, its right-click menu opening a bond's page or booking against it, and its
 * export in the toolbar. */

import { Grid } from "@basis/parallax";
import type { GridCell, GridMenuItem, Layout, LayoutFor } from "@basis/parallax";
import {
  FilterBar,
  Page,
  SavedViews,
  browserViewStore,
  filterSearchSchema,
  useFilters,
  useTelemetry,
} from "@basis/ui";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactElement } from "react";
import { z } from "zod";

import { businessDate, useTrades } from "#data/datasets.ts";
import type { Trade } from "#data/rows.ts";
import { layoutFilters, tradeFilters } from "#data/trade-filters.ts";

/** What a saved view of the blotter holds: the filters, and the grid's sorts and groups. */
const columns = [
  "trade_id",
  "trade_date",
  "fund",
  "book",
  "trader",
  "ticker",
  "asset_class",
  "side",
  "quantity",
  "price_local",
  "currency",
  "net_amount_local",
  "broker",
  "venue",
  "status",
] as const satisfies readonly (keyof Trade)[];

/** A column of the trades, which a saved view, or the layout the grid gives back, names. */
const columnSchema = z.enum(columns);
const sortSchema = z.object({ column: columnSchema, descending: z.boolean().optional() });
const shapeSchema = z.object({ group_by: z.array(columnSchema), sort: z.array(sortSchema) });
const viewSchema = shapeSchema.extend({ filters: filterSearchSchema(tradeFilters) });
type BlotterView = z.infer<typeof viewSchema>;

const store = browserViewStore({
  key: "showcase.blotter",
  parse: (state) => viewSchema.safeParse(state).data,
});

/** The grid's layout: the columns, the filters from the bar, and the view's sorts and groups. */
function blotterLayout(view: BlotterView): LayoutFor<Trade> {
  return {
    cells: {
      net_amount_local: { from: "zero", kind: "bar" },
      side: {
        kind: "badge",
        values: { Buy: "positive", Cover: "info", Sell: "negative", Short: "warning" },
      },
      status: {
        kind: "badge",
        values: { Cancelled: "negative", Filled: "positive", PartiallyFilled: "warning" },
      },
    },
    columns: [...columns],
    filters: layoutFilters(view.filters),
    group_by: view.group_by,
    pinned: ["trade_id"],
    sort: view.sort,
    totals: [{ aggregate: "sum", column: "net_amount_local" }],
  };
}

function BlotterPage(): ReactElement {
  const filters = useFilters(tradeFilters);
  const navigate = useNavigate();
  const telemetry = useTelemetry();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "blotter" });
  };
  const trades = useTrades();
  const [shape, setShape] = useState<Pick<BlotterView, "group_by" | "sort">>({
    group_by: [],
    sort: [{ column: "trade_id", descending: true }],
  });
  const view: BlotterView = { ...shape, filters: filters.values };
  const menu = (cell: GridCell | null): readonly GridMenuItem[] =>
    cell === null
      ? []
      : [
          {
            label: `Book a trade in ${cell.text}`,
            onSelect: () => {
              navigate({ to: "/book" }).catch(report);
            },
          },
        ];
  return (
    <Page
      title="Blotter"
      description="Two years of the desk's trades, 1,000,000 of them: filter, sort, group, save a view, export."
      layout="fill"
      actions={
        <SavedViews
          label="Blotter views"
          store={store}
          state={view}
          onApply={(saved) => {
            setShape({ group_by: saved.group_by, sort: saved.sort });
            filters.setAll(saved.filters);
          }}
        />
      }
    >
      <FilterBar filters={filters} />
      <Grid
        asOf={businessDate}
        contextMenuItems={menu}
        dataset={trades}
        label="Trades"
        layout={blotterLayout(view)}
        onLayoutChange={(layout: Layout) => {
          const changed = shapeSchema.safeParse({ group_by: layout.group_by, sort: layout.sort });
          if (changed.success) {
            setShape(changed.data);
          }
        }}
        rowKey="trade_id"
        selectable
      />
    </Page>
  );
}

export { BlotterPage };
