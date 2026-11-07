import { ChangeDetectionStrategy, Component, inject, input, signal } from "@angular/core";
import { ChartComponent, GridComponent, standardTheme } from "parallax";
import type { ChartSelection, Density, LayoutInput, ParallaxTheme, Scheme } from "parallax";

import { DemoData } from "./data";
import { withSelection, withShare } from "./layouts";
import { BLOTTER, BOOK } from "./small.component";

/** Which small table a tile charts, and so which grid its selection filters. */
type Table = "book" | "blotter";

/** A small chart on the dashboard. */
interface Tile {
  /** A name that stays when the title is reworded, such as for tests. */
  readonly id: string;
  readonly title: string;
  readonly table: Table;
  readonly layout: ReturnType<typeof signal<LayoutInput>>;
}

function tile(id: string, title: string, table: Table, layout: Omit<LayoutInput, "dataset">): Tile {
  return { id, title, table, layout: signal<LayoutInput>({ dataset: table, ...layout }) };
}

/**
 * Small charts over the two small tables, with their grids below. Clicking a bar or slice filters its table's grid to
 * that group, and clicking it again shows every row; Export writes what the grid shows.
 */
@Component({
  selector: "demo-dashboard",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartComponent, GridComponent],
  template: `
    <div class="tiles">
      @for (t of tiles; track t.id) {
        <section [attr.data-tile]="t.id">
          <h2>{{ t.title }}</h2>
          <px-chart [(layout)]="t.layout" [scheme]="scheme()" [theme]="theme()" [statusBar]="false" (selectionChange)="select(t, $event)" />
        </section>
      }
    </div>
    <div class="grids">
      <section data-table="book">
        <h2>Book <span>300 positions, held in this page</span></h2>
        <px-grid [(layout)]="book" [scheme]="scheme()" [theme]="theme()" [density]="density()" [toolbar]="{ group: false }" />
      </section>
      <section data-table="blotter">
        <h2>Blotter <span>500 trades, held in this page</span></h2>
        <px-grid [(layout)]="blotter" [scheme]="scheme()" [theme]="theme()" [density]="density()" [toolbar]="{ group: false }" />
      </section>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 12px;
      height: 100%;
      padding: 0 12px 12px;
      box-sizing: border-box;
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      grid-auto-rows: 320px;
      gap: 12px;
    }
    .grids {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      gap: 12px;
      min-height: 0;
    }
    section {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border: 1px solid var(--demo-line);
      border-radius: 10px;
      background: var(--demo-card);
      box-shadow: var(--demo-shadow);
      overflow: hidden;
    }
    h2 {
      margin: 0;
      padding: 8px 10px 4px;
      font-size: 13px;
      font-weight: 600;
    }
    h2 span {
      margin-left: 6px;
      font-weight: normal;
      color: var(--demo-muted);
    }
    px-chart,
    px-grid {
      flex: 1;
      min-height: 0;
    }
    /* The card frames the grid, so the grid draws no frame of its own. */
    px-grid {
      --px-wrapper-border: none;
      --px-wrapper-radius: 0;
    }
  `
})
export class DashboardComponent {
  public readonly scheme = input<Scheme>("light");
  public readonly theme = input<ParallaxTheme>(standardTheme);
  public readonly density = input<Density>("compact");

  protected readonly book = signal<LayoutInput>(BOOK);
  protected readonly blotter = signal<LayoutInput>(BLOTTER);

  protected readonly tiles: readonly Tile[] = [
    // Short positions' market values are negative, which a pie refuses: gross notional is positive on both sides.
    tile("asset-class", "Gross notional by asset class", "book", {
      group_by: ["asset_class"],
      measures: withShare("notional_usd"),
      group_sort: { by: { measure: 0 }, descending: true },
      formats: { notional_usd: { abbreviate: "millions" } },
      chart: { kind: "pie" }
    }),
    tile("long-short", "Gross notional, long against short", "book", {
      group_by: ["long_short"],
      measures: withShare("notional_usd"),
      group_sort: { by: { measure: 0 }, descending: true },
      formats: { notional_usd: { abbreviate: "millions" } },
      chart: { kind: "pie" }
    }),
    tile("pnl-by-fund", "Daily P&L by fund", "book", {
      group_by: ["fund"],
      measures: [{ column: "daily_pnl_usd", aggregate: "sum" }],
      group_sort: { by: { measure: 0 }, descending: true },
      formats: { daily_pnl_usd: { abbreviate: "thousands", negative: "parentheses" } },
      chart: { kind: "bar", horizontal: true }
    }),
    tile("mv-by-region", "Market value by region", "book", {
      group_by: ["region"],
      measures: [{ column: "market_value_usd", aggregate: "sum" }],
      group_sort: { by: { measure: 0 }, descending: true },
      formats: { market_value_usd: { abbreviate: "millions" } },
      chart: { kind: "bar" }
    }),
    tile("trades-by-side", "Blotter trades by side", "blotter", { group_by: ["side"], measures: withShare(null), group_sort: { by: { measure: 0 }, descending: true }, chart: { kind: "pie" } })
  ];

  constructor() {
    inject(DemoData).need("book", "blotter");
  }

  /** Filters the tile's table's grid to the group clicked, or shows every row again when it is cleared. */
  protected select(t: Tile, selection: ChartSelection | null): void {
    const column = selection?.column ?? t.layout().group_by?.[0];
    if (column === undefined) {
      return;
    }
    const grid = t.table === "book" ? this.book : this.blotter;
    grid.set(withSelection(grid(), column, selection));
  }
}
