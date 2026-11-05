import { ChangeDetectionStrategy, Component, input, signal } from "@angular/core";
import { ChartComponent, GridComponent, standardTheme } from "parallax";
import type { ChartSelection, LayoutFilter, LayoutInput, ParallaxTheme, Scheme } from "parallax";

/** A chart the page shows, with what it says. */
interface Card {
  /** A name that stays when the title is reworded, such as for the chart's screenshot. */
  readonly id: string;
  readonly title: string;
  readonly layout: ReturnType<typeof signal<LayoutInput>>;
  /** Whether a brush on it narrows the grid beside it. */
  readonly linked: boolean;
}

const THREE = ["QYE", "ZREZ", "NV"];

const QYE: LayoutFilter = { column: "ticker", op: "eq", value: "QYE", values: [], columns: [] };

const ALL_DAYS = "QYE's days, all of them until a range of candles is selected";

/** The grid beside the candles: QYE's days, narrowed to a brushed range. */
function rowsLayout(brush: readonly LayoutFilter[]): LayoutInput {
  return { dataset: "prices", filters: [QYE, ...brush], sort: [{ column: "date", descending: true }], columns: ["date", "open", "high", "low", "close", "volume"] };
}

const ALL_POSITIONS = "Positions, all of them until a slice of the donut is selected";

/** The grid beside the donut: positions, narrowed to the asset class of a clicked slice. */
function positionsLayout(selected: ChartSelection | null): LayoutInput {
  const filters = selected === null ? [] : [{ column: selected.column, op: "eq" as const, value: selected.value }];
  return { dataset: "positions", filters, columns: ["position_id", "fund", "asset_class", "ticker", "market_value_usd"], formats: { market_value_usd: { abbreviate: "millions" } } };
}

function card(id: string, title: string, layout: LayoutInput, linked = false): Card {
  return { id, title, layout: signal(layout), linked };
}

/** Every chart kind over the generated data: prices held in the browser, positions on the server. */
@Component({
  selector: "demo-charts",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartComponent, GridComponent],
  template: `
    @for (c of cards; track c.id) {
      <section [attr.data-card]="c.id" [class.wide]="c.id === 'technical'">
        <h2>{{ c.title }}</h2>
        <px-chart [(layout)]="c.layout" [scheme]="scheme()" [theme]="theme()" (brushed)="brush(c, $event)" (selectionChange)="select(c, $event)" />
      </section>
      @if (c.linked) {
        <section data-linked="candles">
          <h2>{{ rowsTitle() }}</h2>
          <px-grid [(layout)]="rows" [scheme]="scheme()" [theme]="theme()" />
        </section>
      }
      @if (c.id === "donut") {
        <section data-linked="donut">
          <h2>{{ positionsTitle() }}</h2>
          <px-grid [(layout)]="positions" [scheme]="scheme()" [theme]="theme()" />
        </section>
      }
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(520px, 1fr));
      grid-auto-rows: 340px;
      gap: 12px;
      padding: 12px;
      overflow: auto;
      height: 100%;
      box-sizing: border-box;
    }
    section.wide {
      grid-column: 1 / -1;
      grid-row: span 2;
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
      padding: 8px 10px 0;
      font-size: 13px;
      font-weight: 600;
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
export class ChartsComponent {
  public readonly scheme = input<Scheme>("light");
  public readonly theme = input<ParallaxTheme>(standardTheme);

  /** The grid of QYE's days, narrowed by a brush on the candles. */
  protected readonly rows = signal<LayoutInput>(rowsLayout([]));
  protected readonly rowsTitle = signal(ALL_DAYS);

  /** The positions beside the donut, narrowed to a clicked slice's asset class. */
  protected readonly positions = signal<LayoutInput>(positionsLayout(null));
  protected readonly positionsTitle = signal(ALL_POSITIONS);

  /** A slice clicked on the donut narrows its grid to that asset class; clicking it again shows every position. */
  protected select(c: Card, selected: ChartSelection | null): void {
    if (c.id !== "donut") {
      return;
    }
    this.positions.set(positionsLayout(selected));
    this.positionsTitle.set(selected === null ? ALL_POSITIONS : `Positions in ${selected.label}, the slice selected`);
  }

  /** A brushed range on a linked chart narrows the grid to the days it covers; clearing it shows them all. */
  protected brush(c: Card, filters: readonly LayoutFilter[] | null): void {
    if (!c.linked) {
      return;
    }
    this.rows.set(rowsLayout(filters ?? []));
    this.rowsTitle.set(filters === null ? ALL_DAYS : "QYE's days in the selected candles");
  }

  protected readonly cards: readonly Card[] = [
    card("technical", "QYE since 2025: SMA 50, Bollinger Bands and drawings over the candles, RSI, MACD and volume below", {
      dataset: "prices",
      filters: [
        { column: "ticker", op: "eq", value: "QYE" },
        { column: "date", op: "ge", value: "2025-01-01" }
      ],
      chart: {
        kind: "candlestick",
        x: "date",
        axis: "trading",
        ohlc: { open: "open", high: "high", low: "low", close: "close" },
        volume: "volume",
        events: "event",
        indicators: [{ kind: "sma", period: 50 }, { kind: "bollinger" }, { kind: "rsi" }, { kind: "macd" }, { kind: "volume" }],
        drawings: [
          { kind: "trend", from: { x: "2025-04-07", y: 8100 }, to: { x: "2026-02-02", y: 12900 } },
          { kind: "fibonacci", from: { x: "2025-11-03", y: 9300 }, to: { x: "2026-03-02", y: 13700 } },
          { kind: "horizontal", y: 12000 },
          { kind: "note", at: { x: "2026-03-02", y: 13700 }, text: "Year's high" }
        ]
      }
    }),
    card("compare", "QYE, ZREZ and NV since 2025, compared as percentage changes", {
      dataset: "prices",
      filters: [
        { column: "ticker", op: "in", values: THREE },
        { column: "date", op: "ge", value: "2025-01-01" }
      ],
      chart: { kind: "line", x: "date", y: ["close"], series: "ticker", axis: "trading", compare: true, events: "event" }
    }),
    card("closes-log", "Closing prices on trading days, log scale", {
      dataset: "prices",
      filters: [{ column: "ticker", op: "in", values: THREE }],
      chart: { kind: "line", x: "date", y: ["close"], series: "ticker", axis: "trading", log_y: true }
    }),
    card(
      "candles",
      "QYE candles, bucketed to fit: drag to pan, wheel to zoom, Shift-drag to select days",
      { dataset: "prices", filters: [QYE], chart: { kind: "candlestick", x: "date", axis: "trading", ohlc: { open: "open", high: "high", low: "low", close: "close" } } },
      true
    ),
    card("close-and-volume", "NV close since 2025, with its volume on a second axis", {
      dataset: "prices",
      filters: [
        { column: "ticker", op: "eq", value: "NV" },
        { column: "date", op: "ge", value: "2025-01-01" }
      ],
      chart: { kind: "line", x: "date", y: ["close"], y_right: ["volume"], axis: "trading" }
    }),
    card("ohlc", "NV OHLC bars since 2024", {
      dataset: "prices",
      filters: [
        { column: "ticker", op: "eq", value: "NV" },
        { column: "date", op: "ge", value: "2024-01-01" }
      ],
      chart: { kind: "ohlc", x: "date", axis: "trading", ohlc: { open: "open", high: "high", low: "low", close: "close" } }
    }),
    card("area", "QYE close since 2025, as an area", {
      dataset: "prices",
      filters: [
        { column: "ticker", op: "eq", value: "QYE" },
        { column: "date", op: "ge", value: "2025-01-01" }
      ],
      chart: { kind: "area", x: "date", y: ["close"], axis: "trading" }
    }),
    card("stacked-bars", "Market value by sector and asset class", {
      dataset: "positions",
      group_by: ["sector"],
      split_by: ["asset_class"],
      measures: [{ column: "market_value_usd", aggregate: "sum" }],
      formats: { market_value_usd: { abbreviate: "millions" } },
      chart: { kind: "bar", stacked: true }
    }),
    card("horizontal-bars", "Market value by sector, long and short side by side", {
      dataset: "positions",
      group_by: ["sector"],
      split_by: ["long_short"],
      measures: [{ column: "market_value_usd", aggregate: "sum" }],
      formats: { market_value_usd: { abbreviate: "millions" } },
      chart: { kind: "bar", horizontal: true }
    }),
    card("histogram", "Beta of long and short positions", { dataset: "positions", formats: { beta: { decimals: 2 } }, chart: { kind: "histogram", x: "beta", series: "long_short" } }),
    card("density", "Daily P&L against market value", { dataset: "positions", chart: { kind: "scatter", x: "market_value_usd", y: ["daily_pnl_usd"] } }),
    card("heatmap", "Daily P&L by sector and asset class", {
      dataset: "positions",
      group_by: ["sector"],
      split_by: ["asset_class"],
      measures: [{ column: "daily_pnl_usd", aggregate: "sum" }],
      formats: { daily_pnl_usd: { abbreviate: "thousands", negative: "parentheses" } },
      chart: { kind: "heatmap" }
    }),
    card("donut", "Market value by asset class: click a slice to list its positions", {
      dataset: "positions",
      group_by: ["asset_class"],
      measures: [
        { column: "market_value_usd", aggregate: "sum" },
        { column: "market_value_usd", aggregate: "sum", show_as: "percent_of_grand_total" }
      ],
      group_sort: { by: { measure: 0 }, descending: true },
      formats: { market_value_usd: { abbreviate: "millions" } },
      chart: { kind: "pie" }
    }),
    card("pie", "Positions by sector, the seven largest and the rest", {
      dataset: "positions",
      group_by: ["sector"],
      measures: [{ aggregate: "count_all" }, { aggregate: "count_all", show_as: "percent_of_grand_total" }],
      group_sort: { by: { measure: 0 }, descending: true },
      chart: { kind: "pie", donut: false }
    })
  ];
}
