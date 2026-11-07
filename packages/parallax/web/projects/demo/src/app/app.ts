import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from "@angular/core";
import { GridComponent, PivotComponent, decodeLayout, encodeLayout } from "parallax";
import type { Density, LayoutInput, Scheme } from "parallax";
import * as z from "zod/mini";

import { BreakdownsComponent } from "./breakdowns.component";
import { ChartsComponent } from "./charts.component";
import { DashboardComponent } from "./dashboard.component";
import { DemoData, isDemoDataset } from "./data";
import { TechnicalComponent } from "./technical.component";
import { ThemeStudioComponent } from "./theme-studio.component";
import { LOOKS, lookSchema } from "./themes";
import type { Look } from "./themes";
import { PerformanceComponent } from "./performance.component";
import type { GridStats } from "./performance.component";
import { SmallComponent } from "./small.component";
import { SAMPLE, SourceComponent } from "./source.component";

/** A view the demo opens, and what it shows off. */
interface Preset {
  readonly title: string;
  readonly about: string;
  readonly layout: LayoutInput;
}

/** The rows of the large generated datasets, positions and trades. */
const ROWS = "150,000";

const REFERENCE_PIVOT = {
  group_by: ["fund", "strategy", "sector", "ticker"],
  split_by: ["asset_class"],
  measures: [{ column: "market_value_usd", aggregate: "sum" }, { column: "daily_pnl_usd", aggregate: "sum" }, { aggregate: "count_all" }],
  expand_depth: 3
} as const satisfies LayoutInput;

/** The views the demo opens, in the order of their tabs. */
const PRESET_NAMES = ["pivot", "source", "trades", "sorted", "prices", "small", "dashboard", "breakdowns", "charts", "technical"] as const;

type PresetName = (typeof PRESET_NAMES)[number];

/** The views the demo opens, and the end-to-end tests with them. */
const PRESETS: Readonly<Record<PresetName, Preset>> = {
  pivot: {
    title: "Positions pivot",
    about: `${ROWS} generated positions, the most rows a table in the browser holds, loaded into this page and pivoted by the engine compiled to WebAssembly in a worker. The pivot groups fund, strategy, sector and ticker by asset class. Change it in the settings, double-click a value for the rows behind it, export it to Excel.`,
    layout: { dataset: "positions", ...REFERENCE_PIVOT }
  },
  source: {
    title: "Data from the app",
    about:
      "Data the app makes itself, as its own API would send it: the Arrow bytes move into this page's worker, and every view and export of them runs there. The API says when it read the data and which NaNs it blanked. Open an Arrow stream file to load your own, within the browser's limits.",
    layout: { dataset: SAMPLE }
  },
  trades: {
    title: `${ROWS} trades`,
    about: `${ROWS} generated trades loaded into this page; the grid draws only the rows on screen. Sort by a header, select with the mouse or keyboard, copy with Ctrl+C.`,
    layout: { dataset: "trades" }
  },
  sorted: {
    title: "Largest trades",
    about:
      "The trades sorted by gross amount, largest first, with amounts shown exactly. The trade's id and ticker stay pinned at the left, and the footer counts the trades and totals their quantities.",
    layout: {
      dataset: "trades",
      sort: [{ column: "gross_amount_local", descending: true }],
      pinned: ["trade_id", "ticker"],
      totals: [
        { column: "trade_id", aggregate: "count" },
        { column: "quantity", aggregate: "sum" }
      ]
    }
  },
  small: {
    title: "Small tables",
    about:
      "Two tables of a few hundred rows, the size most tables are: 300 positions and 500 trades, each loaded into this page and run by the WebAssembly engine. Every change should feel instant; open Performance to time each one from the click or keystroke to the screen.",
    layout: { dataset: "book" }
  },
  dashboard: {
    title: "Dashboard",
    about:
      "Small charts over the two small tables, with their grids below: click a slice or bar to filter its table's grid to that group, and again to show every row. Export writes what the grid shows.",
    layout: { dataset: "book" }
  },
  breakdowns: {
    title: "Breakdowns",
    about: `Big pies, donuts and bars over the ${ROWS} positions and the ${ROWS} trades. Bars carry their values and slices their shares; hover a slice to see it in the donut's hole. Click a slice or bar to narrow every other chart of the same dataset to that group, and its chip to show them all again.`,
    layout: { dataset: "positions" }
  },
  charts: {
    title: "Charts",
    about:
      "Every chart kind, reduced by the engine to the pixels it fills: lines on trading days, candles bucketed to fit, stacked bars, a histogram, a density of a thousand points and a heatmap that diverges around zero. Hover for values; the price charts share a crosshair. Drag to pan, scroll to zoom, double-click to show everything, and Shift-drag on the candles to list those days.",
    layout: { dataset: "prices" }
  },
  technical: {
    title: "Technical analysis",
    about:
      "One ticker's prices with the indicators, chart kind and range the controls set. Indicators are computed by the engine over every row and checked against TA-Lib. Draw with the tools above the chart, measure with Measure, Shift-drag to list those days below, or compare three tickers as percentage changes.",
    layout: { dataset: "prices" }
  },
  prices: { title: "Daily prices", about: "Daily prices for 50 tickers with fat-tailed returns.", layout: { dataset: "prices", sort: [{ column: "date", descending: true }, { column: "ticker" }] } }
};

const themeSchema = z.enum(["light", "dark", "auto"]);
const densitySchema = z.enum(["compact", "comfortable"]);

const searchSchema = z.strictObject({
  preset: z._default(z.enum(PRESET_NAMES), "pivot"),
  theme: z._default(themeSchema, "light"),
  look: z._default(lookSchema, "standard"),
  density: z._default(densitySchema, "compact"),
  performance: z._default(z.enum(["on", "off"]), "off"),
  layout: z.optional(z.string())
});

type Search = z.infer<typeof searchSchema>;

function readSearch(): Search {
  const parsed = searchSchema.safeParse(Object.fromEntries(new URLSearchParams(location.search)));
  return parsed.success ? parsed.data : searchSchema.parse({});
}

/** Sets one search parameter in the address bar without reloading. */
function remember(name: string, value: string): void {
  const url = new URL(location.href);
  url.searchParams.set(name, value);
  history.replaceState(null, "", url);
}

@Component({
  selector: "demo-root",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "[class.dark]": "theme() === 'dark'", "[class.auto]": "theme() === 'auto'" },
  imports: [BreakdownsComponent, ChartsComponent, DashboardComponent, GridComponent, PivotComponent, PerformanceComponent, SmallComponent, SourceComponent, TechnicalComponent, ThemeStudioComponent],
  template: `
    <header>
      <span class="brand"><span class="mark" aria-hidden="true"></span>parallax</span>
      <nav aria-label="Views">
        @for (tab of tabs(); track tab.name) {
          <a [href]="tab.href" [attr.aria-current]="tab.current ? 'page' : null">{{ tab.title }}</a>
        }
      </nav>
      <div class="controls">
        <label for="demo-look">Theme</label>
        <select id="demo-look" (change)="setLook($event)">
          @for (l of looks; track l.name) {
            <option [value]="l.name" [selected]="l.name === look()">{{ l.title }}</option>
          }
        </select>
        <label for="demo-scheme">Scheme</label>
        <select id="demo-scheme" [value]="theme()" (change)="setTheme($event)">
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="auto">System</option>
        </select>
        <label for="demo-density">Row height</label>
        <select id="demo-density" [value]="density()" (change)="setDensity($event)">
          <option value="compact">Compact</option>
          <option value="comfortable">Comfortable</option>
        </select>
        <button type="button" [attr.aria-pressed]="studio()" (click)="studio.set(!studio())">Theme studio</button>
        <button type="button" [attr.aria-pressed]="performance()" (click)="togglePerformance()">Performance</button>
        <button type="button" [disabled]="pageOfViews()" [title]="pageOfViews() ? 'This page holds several views of its own' : ''" (click)="share()">Copy link to this view</button>
        <details [hidden]="pageOfViews()">
          <summary>Layout</summary>
          <pre data-testid="layout-json">{{ layoutJson() }}</pre>
        </details>
        <span role="status">{{ note() }}</span>
      </div>
    </header>
    <p class="about">{{ about() }}</p>
    <main>
      @if (charts()) {
        <demo-charts [scheme]="theme()" [theme]="lookTheme()" />
      } @else if (small()) {
        <demo-small [scheme]="theme()" [theme]="lookTheme()" [density]="density()" />
      } @else if (source()) {
        <demo-source [scheme]="theme()" [theme]="lookTheme()" [density]="density()" />
      } @else if (dashboard()) {
        <demo-dashboard [scheme]="theme()" [theme]="lookTheme()" [density]="density()" />
      } @else if (breakdowns()) {
        <demo-breakdowns [scheme]="theme()" [theme]="lookTheme()" />
      } @else if (technical()) {
        <demo-technical [scheme]="theme()" [theme]="lookTheme()" [density]="density()" />
      } @else if (ready()) {
        @if (grouped()) {
          <px-pivot [(layout)]="layout" [scheme]="theme()" [theme]="lookTheme()" [density]="density()" />
        } @else {
          <px-grid [(layout)]="layout" [scheme]="theme()" [theme]="lookTheme()" [density]="density()" />
        }
      }
    </main>
    <!-- Always there, so that a theme made in it applies from the first paint; hidden while closed. -->
    <demo-theme-studio [hidden]="!studio()" (closed)="studio.set(false)" />
    @if (performance()) {
      <demo-performance [stats]="readStats" [context]="context()" />
    }
  `,
  styles: `
    /* The demo's own colours, which its pages share; the accent follows a --px-accent set on the page. */
    :host {
      --demo-page: #f4f5f7;
      --demo-card: #ffffff;
      --demo-fg: #1d2330;
      --demo-muted: #667085;
      --demo-line: #e1e3e8;
      --demo-hover: #eceef2;
      --demo-accent: var(--px-accent, #2563eb);
      --demo-chip: color-mix(in srgb, var(--demo-accent) 12%, var(--demo-card));
      --demo-shadow: 0 1px 2px rgba(16, 24, 40, 0.05);
      display: grid;
      grid-template-rows: auto auto 1fr;
      height: 100vh;
      color-scheme: light;
      font:
        14px system-ui,
        -apple-system,
        "Segoe UI",
        sans-serif;
      color: var(--demo-fg);
      background: var(--demo-page);
    }
    :host(.dark) {
      --demo-page: #0e1014;
      --demo-card: #16181d;
      --demo-fg: #e3e6ec;
      --demo-muted: #8a93a3;
      --demo-line: #2a2e37;
      --demo-hover: #22262e;
      --demo-accent: var(--px-accent, #5b9bff);
      --demo-shadow: none;
      color-scheme: dark;
    }
    @media (prefers-color-scheme: dark) {
      :host(.auto) {
        --demo-page: #0e1014;
        --demo-card: #16181d;
        --demo-fg: #e3e6ec;
        --demo-muted: #8a93a3;
        --demo-line: #2a2e37;
        --demo-hover: #22262e;
        --demo-accent: var(--px-accent, #5b9bff);
        --demo-shadow: none;
        color-scheme: dark;
      }
    }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--demo-line);
      background: var(--demo-card);
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.01em;
    }
    .mark {
      width: 18px;
      height: 18px;
      border-radius: 5px;
      background: linear-gradient(135deg, var(--demo-accent), color-mix(in srgb, var(--demo-accent) 45%, #14b8a6));
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
    }
    nav a {
      padding: 5px 10px;
      border-radius: 6px;
      color: var(--demo-muted);
      text-decoration: none;
      font-size: 13px;
    }
    nav a:hover {
      background: var(--demo-hover);
      color: var(--demo-fg);
    }
    nav a[aria-current="page"] {
      background: var(--demo-chip);
      color: var(--demo-accent);
      font-weight: 600;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }
    label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--demo-muted);
      font-size: 12px;
    }
    select,
    button,
    summary {
      height: 28px;
      padding: 0 10px;
      border: 1px solid var(--demo-line);
      border-radius: 6px;
      background-color: var(--demo-card);
      color: var(--demo-fg);
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }
    select {
      appearance: none;
      padding-right: 26px;
      background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
      background-position:
        calc(100% - 14px) 55%,
        calc(100% - 9px) 55%;
      background-size: 5px 5px;
      background-repeat: no-repeat;
    }
    select:hover,
    button:hover:not(:disabled),
    summary:hover {
      background-color: var(--demo-hover);
    }
    select:focus-visible,
    button:focus-visible,
    summary:focus-visible {
      outline: 2px solid var(--demo-accent);
      outline-offset: 1px;
    }
    button[aria-pressed="true"] {
      border-color: color-mix(in srgb, var(--demo-accent) 45%, transparent);
      background-color: var(--demo-chip);
      color: var(--demo-accent);
    }
    button:disabled {
      color: var(--demo-muted);
      cursor: default;
      opacity: 0.6;
    }
    [role="status"] {
      color: var(--demo-muted);
      font-size: 12px;
    }
    .about {
      margin: 0;
      padding: 10px 16px 8px;
      color: var(--demo-muted);
      font-size: 13px;
    }
    main {
      min-height: 0;
    }
    /* A single grid or pivot fills the page below, inset like the cards of the other pages. */
    main > px-grid,
    main > px-pivot {
      box-sizing: border-box;
      height: calc(100% - 12px);
      margin: 0 12px;
      box-shadow: var(--demo-shadow);
    }
    details {
      position: relative;
    }
    summary {
      display: inline-flex;
      align-items: center;
      list-style: none;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    pre {
      position: absolute;
      right: 0;
      z-index: 5;
      max-height: 60vh;
      overflow: auto;
      margin: 4px 0 0;
      padding: 10px;
      border: 1px solid var(--demo-line);
      border-radius: 8px;
      background: var(--demo-card);
      color: var(--demo-fg);
      font-size: 12px;
      box-shadow: 0 12px 32px rgba(16, 24, 40, 0.18);
    }
  `
})
export class App {
  protected readonly search = readSearch();
  protected readonly layout = signal<LayoutInput>(PRESETS[this.search.preset].layout);
  /** The light or dark scheme, or the system's; the address bar calls it the theme, as it did before looks. */
  protected readonly theme = signal<Scheme>(this.search.theme);
  /** The look: one of the library's themes or the demo's own. */
  protected readonly look = signal<Look>(this.search.look);
  protected readonly lookTheme = computed(() => LOOKS[this.look()].theme);
  protected readonly looks = lookSchema.options.map((name) => ({ name, title: LOOKS[name].title }));
  /** Whether the theme studio is open. */
  protected readonly studio = signal(false);
  protected readonly density = signal<Density>(this.search.density);
  protected readonly performance = signal(this.search.performance === "on");
  protected readonly layoutJson = computed(() => JSON.stringify(this.layout(), null, 2));
  /** A linked layout opens as a pivot if it groups, and as a grid otherwise. */
  protected readonly grouped = computed(() => {
    const layout = this.layout();
    return (layout.group_by?.length ?? 0) > 0 || (layout.split_by?.length ?? 0) > 0 || (layout.measures?.length ?? 0) > 0;
  });
  protected readonly note = signal("");
  /** The charts page, which shows several views of its own. */
  protected readonly charts = computed(() => this.search.preset === "charts" && this.search.layout === undefined);
  /** The technical-analysis page, which has its own controls. */
  protected readonly technical = computed(() => this.search.preset === "technical" && this.search.layout === undefined);
  /** The page of big pies, donuts and bars. */
  protected readonly breakdowns = computed(() => this.search.preset === "breakdowns" && this.search.layout === undefined);
  /** The page of data the app loads itself, which has its own controls. */
  protected readonly source = computed(() => this.search.preset === "source" && this.search.layout === undefined);
  /** The small-tables page, which shows two grids. */
  protected readonly small = computed(() => this.search.preset === "small" && this.search.layout === undefined);
  /** The dashboard, of small charts over the small tables and their grids. */
  protected readonly dashboard = computed(() => this.search.preset === "dashboard" && this.search.layout === undefined);
  /** A page of views of its own, which the header's link and layout cannot describe. */
  protected readonly pageOfViews = computed(() => this.charts() || this.technical() || this.small() || this.dashboard() || this.breakdowns() || this.source());
  /** False while a linked layout is being read, so the preset never opens in its place. */
  protected readonly ready = signal(this.search.layout === undefined);
  protected readonly about = computed(() => (this.search.layout === undefined ? PRESETS[this.search.preset].about : "A view opened from a shared link."));
  protected readonly tabs = computed(() =>
    PRESET_NAMES.map((name) => {
      const params = new URLSearchParams({ preset: name, theme: this.theme(), look: this.look(), density: this.density(), performance: this.performance() ? "on" : "off" });
      return { name, title: PRESETS[name].title, href: `?${params.toString()}`, current: this.search.layout === undefined && name === this.search.preset };
    })
  );
  protected readonly context = computed(() => {
    const showing = this.small() ? "book and blotter, grids" : `${this.layout().dataset ?? "no dataset"}, ${this.grouped() ? "pivot" : "grid"}`;
    return `${showing}, ${this.theme()} theme, ${this.density()} rows, ${this.look()} look`;
  });

  private readonly grid = viewChild(GridComponent);
  private readonly pivot = viewChild(PivotComponent);
  private readonly smallTables = viewChild(SmallComponent);
  /** The drawing counters of each grid on the page, for the performance overlay. */
  protected readonly readStats = (): readonly GridStats[] => {
    const name = this.layout().dataset ?? "";
    const stats = this.grid()?.drawStats() ?? this.pivot()?.drawStats() ?? null;
    return stats === null ? (this.smallTables()?.stats() ?? []) : [{ name, stats }];
  };

  private readonly data = inject(DemoData);

  constructor() {
    const link = this.search.layout;
    if (link === undefined) {
      // The pages of views of their own load what they show; the presets shown here load their dataset.
      this.need(this.layout().dataset);
    } else {
      decodeLayout(link).then(
        (layout) => {
          this.need(layout.dataset);
          this.layout.set(layout);
          this.ready.set(true);
        },
        (failure: unknown) => {
          this.note.set(`The link's layout could not be read, so the preset is shown: ${failure instanceof Error ? failure.message : String(failure)}`);
          this.ready.set(true);
        }
      );
    }
  }

  /** Loads the dataset a view of the header's preset or a shared link names, if the demo serves it. */
  private need(dataset: string | undefined): void {
    if (dataset !== undefined && isDemoDataset(dataset) && !this.pageOfViews()) {
      this.data.need(dataset);
    }
  }

  protected setTheme(event: Event): void {
    const parsed = themeSchema.safeParse(event.target instanceof HTMLSelectElement ? event.target.value : null);
    if (parsed.success) {
      this.theme.set(parsed.data);
      remember("theme", parsed.data);
    }
  }

  protected setLook(event: Event): void {
    const parsed = lookSchema.safeParse(event.target instanceof HTMLSelectElement ? event.target.value : null);
    if (parsed.success) {
      this.look.set(parsed.data);
      remember("look", parsed.data);
    }
  }

  protected setDensity(event: Event): void {
    const parsed = densitySchema.safeParse(event.target instanceof HTMLSelectElement ? event.target.value : null);
    if (parsed.success) {
      this.density.set(parsed.data);
      remember("density", parsed.data);
    }
  }

  protected togglePerformance(): void {
    this.performance.update((on) => !on);
    remember("performance", this.performance() ? "on" : "off");
  }

  protected share(): void {
    encodeLayout(this.layout()).then(
      (encoded) => {
        remember("layout", encoded);
        this.note.set("The address bar now links to this view.");
      },
      (failure: unknown) => {
        this.note.set(failure instanceof Error ? failure.message : String(failure));
      }
    );
  }
}
