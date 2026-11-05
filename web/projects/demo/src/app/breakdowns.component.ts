import { ChangeDetectionStrategy, Component, computed, input, signal } from "@angular/core";
import { ChartComponent, standardTheme } from "parallax";
import type { ChartSelection, LayoutFilter, LayoutInput, ParallaxTheme, Scheme } from "parallax";

import { withShare } from "./layouts";

/** The two datasets the page charts, both held on the server. */
type Dataset = "positions" | "trades";

/** A big chart on the page, over one dataset. */
interface Breakdown {
  /** A name that stays when the title is reworded, such as for tests and screenshots. */
  readonly id: string;
  readonly title: string;
  readonly dataset: Dataset;
  /** The chart's own layout, before the page's filter; its first group column is what a click on it selects. */
  readonly layout: LayoutInput;
}

/** The group a click picked, which narrows every other chart over the same dataset. */
interface Pick {
  readonly chart: string;
  readonly selection: ChartSelection;
}

function breakdown(id: string, title: string, dataset: Dataset, layout: Omit<LayoutInput, "dataset">): Breakdown {
  return { id, title, dataset, layout: { dataset, ...layout } };
}

const LARGEST_FIRST = { by: { measure: 0 }, descending: true } as const;

/**
 * Big pies, donuts and bars over the 200,000 positions and the 1,000,000 trades, both held on the server. Gross
 * notional rather than market value, because short positions' market values are negative, which a pie refuses.
 */
const BREAKDOWNS: readonly Breakdown[] = [
  breakdown("notional-by-region", "Gross notional by region", "positions", {
    group_by: ["region"],
    measures: withShare("notional_usd"),
    group_sort: LARGEST_FIRST,
    formats: { notional_usd: { abbreviate: "billions" } },
    chart: { kind: "pie" }
  }),
  breakdown("positions-by-fund", "Positions by fund", "positions", {
    group_by: ["fund"],
    measures: withShare(null),
    group_sort: LARGEST_FIRST,
    top_n: { n: 8, measure: 0 },
    chart: { kind: "pie", donut: false }
  }),
  breakdown("notional-by-currency", "Gross notional by currency: the seven largest and the rest", "positions", {
    group_by: ["currency"],
    measures: withShare("notional_usd"),
    group_sort: LARGEST_FIRST,
    formats: { notional_usd: { abbreviate: "billions" } },
    chart: { kind: "pie" }
  }),
  breakdown("pnl-by-strategy", "Daily P&L by strategy", "positions", {
    group_by: ["strategy"],
    measures: [{ column: "daily_pnl_usd", aggregate: "sum" }],
    group_sort: LARGEST_FIRST,
    formats: { daily_pnl_usd: { abbreviate: "millions", negative: "parentheses" } },
    chart: { kind: "bar" }
  }),
  breakdown("largest-tickers", "The ten largest tickers by gross notional", "positions", {
    group_by: ["ticker"],
    measures: [{ column: "notional_usd", aggregate: "sum" }],
    group_sort: LARGEST_FIRST,
    top_n: { n: 10, measure: 0, other: false },
    formats: { notional_usd: { abbreviate: "billions" } },
    chart: { kind: "bar", horizontal: true }
  }),
  breakdown("notional-by-fund-and-class", "Gross notional by fund and asset class", "positions", {
    group_by: ["fund"],
    split_by: ["asset_class"],
    measures: [{ column: "notional_usd", aggregate: "sum" }],
    formats: { notional_usd: { abbreviate: "billions" } },
    chart: { kind: "bar", stacked: true }
  }),
  breakdown("long-short-by-region", "Long against short by region", "positions", {
    group_by: ["region"],
    split_by: ["long_short"],
    measures: [{ column: "notional_usd", aggregate: "sum" }],
    formats: { notional_usd: { abbreviate: "billions" } },
    chart: { kind: "bar" }
  }),
  breakdown("trades-by-status", "Trades by status", "trades", { group_by: ["status"], measures: withShare(null), group_sort: LARGEST_FIRST, chart: { kind: "pie" } }),
  breakdown("trades-by-broker", "Trades by broker", "trades", { group_by: ["broker"], measures: [{ aggregate: "count_all" }], group_sort: LARGEST_FIRST, chart: { kind: "bar", horizontal: true } }),
  breakdown("trades-by-order-type", "Trades by order type", "trades", { group_by: ["order_type"], measures: withShare(null), group_sort: LARGEST_FIRST, chart: { kind: "pie", donut: false } })
];

/** The column a chart groups by first, which a click on it selects. */
function groupColumn(b: Breakdown): string | undefined {
  return b.layout.group_by?.[0];
}

/**
 * The page of big charts. A click on a slice or bar narrows every other chart over the same dataset to that group; a
 * chart grouped by the same column keeps all its groups. The chip above the dataset's charts says what is picked and
 * clears it.
 */
@Component({
  selector: "demo-breakdowns",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartComponent],
  template: `
    @for (part of parts(); track part.dataset) {
      <div class="part" [attr.data-dataset]="part.dataset">
        <h2>
          {{ part.title }}
          @if (part.pick; as p) {
            <button type="button" class="chip" [attr.aria-label]="'Show every ' + p.selection.column + ' again'" (click)="clear(part.dataset)">
              {{ p.selection.column }}: {{ p.selection.label }} <span aria-hidden="true">×</span>
            </button>
          } @else {
            <span class="hint">Click a slice or bar to narrow the others</span>
          }
        </h2>
        <div class="charts">
          @for (c of part.charts; track c.key) {
            <section [attr.data-breakdown]="c.id" [attr.data-filtered]="c.filtered">
              <h3>{{ c.title }}</h3>
              <px-chart [layout]="c.layout" [scheme]="scheme()" [theme]="theme()" (selectionChange)="select(c.id, part.dataset, $event)" />
            </section>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 20px;
      height: 100%;
      overflow: auto;
      padding: 4px 12px 16px;
      box-sizing: border-box;
    }
    h2 {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 8px;
      font-size: 15px;
      font-weight: 600;
    }
    .hint {
      color: var(--demo-muted);
      font-size: 12px;
      font-weight: normal;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 24px;
      padding: 0 10px;
      border: 0;
      border-radius: 12px;
      background: var(--demo-chip);
      color: inherit;
      font: inherit;
      font-size: 12px;
      font-weight: normal;
      cursor: pointer;
    }
    .charts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(560px, 1fr));
      grid-auto-rows: 440px;
      gap: 12px;
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
    h3 {
      margin: 0;
      padding: 10px 12px 0;
      font-size: 13px;
      font-weight: 600;
    }
    px-chart {
      flex: 1;
      min-height: 0;
    }
  `
})
export class BreakdownsComponent {
  public readonly scheme = input<Scheme>("light");
  public readonly theme = input<ParallaxTheme>(standardTheme);

  /** Each dataset's picked group, if any. */
  private readonly picks = signal<Readonly<Record<Dataset, Pick | null>>>({ positions: null, trades: null });
  /**
   * How many times each chart has been drawn again from scratch: a chart whose pick is cleared from its chip, or
   * replaced by another chart's, starts again with nothing selected.
   */
  private readonly generations = signal<Readonly<Record<string, number>>>({});

  protected readonly parts = computed(() => {
    const picks = this.picks();
    const generations = this.generations();
    return (["positions", "trades"] as const).map((dataset) => {
      const pick = picks[dataset];
      return {
        dataset,
        title: dataset === "positions" ? "200,000 positions, held on the server" : "1,000,000 trades, held on the server",
        pick,
        charts: BREAKDOWNS.filter((b) => b.dataset === dataset).map((b) => {
          const layout = narrowed(b, pick);
          return { id: b.id, title: b.title, key: `${b.id}:${String(generations[b.id] ?? 0)}`, layout, filtered: layout !== b.layout };
        })
      };
    });
  });

  protected select(chart: string, dataset: Dataset, selection: ChartSelection | null): void {
    const earlier = this.picks()[dataset];
    if (earlier !== null && earlier.chart !== chart) {
      this.restart(earlier.chart);
    }
    this.picks.update((picks) => ({ ...picks, [dataset]: selection === null ? null : { chart, selection } }));
  }

  protected clear(dataset: Dataset): void {
    const earlier = this.picks()[dataset];
    if (earlier !== null) {
      this.restart(earlier.chart);
    }
    this.picks.update((picks) => ({ ...picks, [dataset]: null }));
  }

  /** Draws `chart` again from scratch, so that it selects nothing. */
  private restart(chart: string): void {
    this.generations.update((g) => ({ ...g, [chart]: (g[chart] ?? 0) + 1 }));
  }
}

/** A chart's layout narrowed to the picked group, unless it groups by the picked column itself, which keeps them all. */
function narrowed(b: Breakdown, pick: Pick | null): LayoutInput {
  if (pick === null || groupColumn(b) === pick.selection.column) {
    return b.layout;
  }
  const filter: LayoutFilter = { column: pick.selection.column, op: "eq", value: pick.selection.value, values: [], columns: [] };
  return { ...b.layout, filters: [filter] };
}
