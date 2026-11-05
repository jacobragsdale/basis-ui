import { ChangeDetectionStrategy, Component, input, signal, viewChild } from "@angular/core";
import { GridComponent } from "parallax";
import type { Density, LayoutInput, ResolvedScheme } from "parallax";

import type { GridStats } from "./performance.component";

/** The book: positions with their ticker pinned, and market value and P&L totalled, in columns near the left. */
export const BOOK: LayoutInput = {
  dataset: "book",
  columns: ["ticker", "fund", "asset_class", "market_value_usd", "daily_pnl_usd", "long_short", "sector", "region", "quantity", "currency", "position_id"],
  pinned: ["ticker"],
  totals: [
    { column: "market_value_usd", aggregate: "sum" },
    { column: "daily_pnl_usd", aggregate: "sum" }
  ],
  formats: { market_value_usd: { decimals: 0 }, daily_pnl_usd: { decimals: 0, negative: "parentheses" } }
};

/** The blotter: trades with their ticker pinned, counted and their quantities totalled. */
export const BLOTTER: LayoutInput = {
  dataset: "blotter",
  columns: ["ticker", "trade_id", "trade_date", "fund", "side", "quantity", "price_local", "currency", "gross_amount_local", "broker", "status"],
  pinned: ["ticker"],
  totals: [
    { column: "trade_id", aggregate: "count" },
    { column: "quantity", aggregate: "sum" }
  ]
};

/**
 * Two small tables side by side: a few hundred rows, the size most tables are. The book is held in the page and
 * run by the WebAssembly engine; the blotter is held on the server. Each sizes itself to its rows, keeps its ticker
 * pinned at the left and totals its amounts at the bottom. Every change should feel instant at this size, and the
 * performance overlay times each one.
 */
@Component({
  selector: "demo-small",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GridComponent],
  template: `
    <section data-table="book">
      <h2>Book <span>300 positions, held in this page</span></h2>
      <px-grid #bookGrid [(layout)]="book" [scheme]="scheme()" [density]="density()" height="auto" [maxHeight]="maxHeight" />
    </section>
    <section data-table="blotter">
      <h2>Blotter <span>500 trades, held on the server</span></h2>
      <px-grid #blotterGrid [(layout)]="blotter" [scheme]="scheme()" [density]="density()" height="auto" [maxHeight]="maxHeight" />
    </section>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
      align-items: start;
      gap: 12px;
      height: 100%;
      padding: 0 12px 12px;
      box-sizing: border-box;
      overflow: auto;
    }
    section {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    h2 {
      margin: 4px 0 6px;
      font-size: 14px;
    }
    h2 span {
      margin-left: 6px;
      font-weight: normal;
      color: #667085;
    }
    px-grid {
      min-height: 0;
    }
  `
})
export class SmallComponent {
  public readonly scheme = input<ResolvedScheme>("light");
  public readonly density = input<Density>("compact");

  protected readonly book = signal<LayoutInput>(BOOK);
  protected readonly blotter = signal<LayoutInput>(BLOTTER);
  /** The tallest each grid grows to: a page of rows, whose toolbar and status bar stay in the window. */
  protected readonly maxHeight = 560;

  private readonly bookGrid = viewChild("bookGrid", { read: GridComponent });
  private readonly blotterGrid = viewChild("blotterGrid", { read: GridComponent });

  /** Each grid's drawing counters, for the performance overlay. */
  public stats(): readonly GridStats[] {
    const stats: GridStats[] = [];
    for (const [name, grid] of [
      ["book", this.bookGrid()],
      ["blotter", this.blotterGrid()]
    ] as const) {
      if (grid !== undefined) {
        stats.push({ name, stats: grid.drawStats() });
      }
    }
    return stats;
  }
}
