# @jacobragsdale/parallax

Angular components for the parallax engine: a data grid, a pivot table and
charts drawn on a Canvas 2D surface, for desktops without a GPU. The engine,
compiled to WebAssembly, runs in a Web Worker in the page, on Arrow data the app
loads into it. The design and its correctness rules are in
[How parallax is designed](../../../docs/design.md).

## Show a view

Serve the package's `wasm` folder, which holds the engine and its worker script:

```jsonc
// angular.json, in the application's build options
"assets": [{ "glob": "**/*", "input": "node_modules/@jacobragsdale/parallax/wasm", "output": "parallax" }]
```

Provide the client once with the worker's address, load the data, then bind a
layout that names it to a grid:

```ts
// app.config.ts
import { provideParallax } from "@jacobragsdale/parallax";

export const appConfig: ApplicationConfig = { providers: [provideParallax({ worker: "/parallax/worker.js" })] };
```

```ts
// positions.component.ts
import { GridComponent, ParallaxClient } from "@jacobragsdale/parallax";
import type { LayoutInput } from "@jacobragsdale/parallax";

@Component({ selector: "app-positions", imports: [GridComponent], template: `<px-grid [(layout)]="layout" scheme="dark" />` })
export class PositionsComponent {
  constructor() {
    const bytes = fetch("/api/positions", { headers: { accept: "application/vnd.apache.arrow.stream" } }).then((r) => r.arrayBuffer());
    // Views that open while the bytes arrive wait for them; a load that fails fails them with its reason.
    inject(ParallaxClient)
      .load("positions", bytes, { primaryKey: "position_id" })
      .catch(() => undefined);
  }

  protected readonly layout = signal<LayoutInput>({
    dataset: "positions",
    group_by: ["fund", "strategy"],
    measures: [{ column: "market_value_usd", aggregate: "sum" }],
    formats: { market_value_usd: { abbreviate: "millions", negative: "parentheses" } }
  });
}
```

[Load the app's data](#load-the-apps-data) says what a load holds and how it
fails. The grid fills its container, so give the container a height.

The two-way binding keeps the layout current as the user sorts, resizes and
expands groups, so saving the layout saves the view. `parseLayout` checks a
layout read from storage or a URL before it is used.

## Show a pivot with its settings

`<px-pivot>` takes the same layout and adds a field list beside the grid, as
Excel's PivotTable has: drag fields into Filters, Columns, Rows and Values, or
use their menus. A value's menu, also on its header, sets its aggregate, how it
is shown and its number format. Double-clicking a value opens the rows behind
its group in a drawer you can search and export.

```html
<px-pivot [(layout)]="layout" />
```

## Filter a grid from a chart

`<px-chart>` draws the chart in a layout's `chart` section. Clicking a bar or
slice of a chart of grouped data selects its group, and the chart emits
`selectionChange` with the group column and the group's exact key, or `null`
when the selection is cleared:

```ts
@Component({
  imports: [ChartComponent, GridComponent],
  template: `
    <px-chart [(layout)]="byClass" [statusBar]="false" (selectionChange)="pick($event)" />
    <px-grid [(layout)]="positions" />
  `
})
export class ExposureComponent {
  protected readonly byClass = signal<LayoutInput>({
    dataset: "positions",
    group_by: ["asset_class"],
    measures: [
      { column: "notional_usd", aggregate: "sum" },
      { column: "notional_usd", aggregate: "sum", show_as: "percent_of_grand_total" }
    ],
    chart: { kind: "pie" }
  });
  protected readonly positions = signal<LayoutInput>({ dataset: "positions" });

  protected pick(selection: ChartSelection | null): void {
    const filters = selection === null ? [] : [{ column: selection.column, op: "eq" as const, value: selection.value }];
    this.positions.set({ dataset: "positions", filters });
  }
}
```

A pie is a donut unless `donut: false`; its second measure, shown as a share of
the total, labels each slice. Bars carry their values and slices their shares
wherever they fit, unless `labels: false`. A donut's hole names the slice under
the pointer. A chart smaller than 260 by 200 pixels drops its legend and
padding.

## Load the app's data

The app hands the engine Arrow bytes it fetched itself, such as its API's
answer to a request for `application/vnd.apache.arrow.stream`, and every view
of them runs in the page:

```ts
const response = await fetch("/api/positions", { headers: { accept: "application/vnd.apache.arrow.stream" } });
await inject(ParallaxClient).load("positions", await response.arrayBuffer());
// Every grid, pivot and chart whose layout names "positions" now runs in the worker.
```

The buffer moves to the worker with the message, so the app can no longer read
it, and the engine decodes it in place. A second load of the same dataset
reloads it, and its open views show the new rows; give `primaryKey` in the
options so that a reload applies as a diff. Load before showing the views, or
while they open: a view of a dataset whose load is under way waits for it.
`load` also takes a promise of the bytes, such as the fetch's
`arrayBuffer()`, so that the load is under way before they arrive. A view of a
dataset the page never loaded fails with a message that says so.

The worker starts, and the engine downloads, when the app first loads data or
a view opens. To show the first rows sooner, start it when the application
starts:

```ts
provideParallax({ worker: "/parallax/worker.js", prewarm: true });
```

In exchange, every page downloads the engine, about 1 MB compressed, and runs
its worker, even a page that shows no parallax view.

A table in the browser holds at most `MAX_ROWS` rows (150,000) and
`MAX_ARROW_BYTES` bytes of Arrow (70,000,000), the limits spike 0.3 measured
for a pivot to answer within 500 ms on a slow desktop. A larger load fails with
a message naming the limit and the size, before it costs the engine any memory:
the bytes are checked before they leave the page, and the rows from the
stream's batch headers before any data is decoded. Narrow larger data in the
API, by filtering or aggregating it.

The status bar's time and NaN badge come from the API, which alone knows them.
It sets them in the stream's schema metadata under `parallax.load`, as JSON:

```json
{ "source_as_of_micros": 1793980800000000, "nans_to_null": [["price", 3]] }
```

`source_as_of_micros` is when the API read its source, in microseconds since
the Unix epoch; without it, the status shows when the page loaded the data.
`nans_to_null` counts, per column, the NaNs the API turned blank before
sending. NaNs still in the stream are turned blank by the engine and counted
with them. The `sourceAsOfMicros` load option overrides the stream's time.

WebAssembly memory never shrinks, so a reload or a large pivot keeps its
high-water mark until the worker ends. A load or export that runs the engine
out of memory stops it for good: the client then ends the worker, which frees
all its memory, fails every open view and waiting request with the reason, and
starts a new, empty one. `ParallaxClient.onRestart` tells the app, which loads
its data again.

## Export a view

The status bar under every grid has **Export to Excel** and **CSV**, and
`GridComponent.export("xlsx")` does the same from code. The view is written in
the browser's worker, which holds its table, and saved as a download. An Excel
export holds at most `MAX_XLSX_CELLS` cells (1,000,000), since the browser
keeps the sheet in memory; a larger view is refused with a reason that says to
export CSV, which reaches the page in chunks as it is written.

## Share a view

`encodeLayout(layout)` returns text for a URL parameter, and
`decodeLayout(text)` reads it back, refusing anything the schema rejects.

## Inputs

`<px-grid>` and `<px-pivot>`:

| Input       | Type                               | Default     | Meaning                                                               |
| ----------- | ---------------------------------- | ----------- | --------------------------------------------------------------------- |
| `layout`    | `LayoutInput`                      | required    | The view. Two-way: `[(layout)]`.                                      |
| `theme`     | `ParallaxTheme`                    | standard    | A theme from `defineTheme`; by default `provideParallax`'s.           |
| `scheme`    | `"light" \| "dark" \| "auto"`      | `"light"`   | The colour scheme; `auto` follows the system. Default as `theme`.     |
| `density`   | `"compact" \| "comfortable"`       | `"compact"` | Comfortable adds 6 pixels to the theme's row and header heights.      |
| `toolbar`   | `boolean \| Partial<ToolbarParts>` | `true`      | The toolbar, or which of its parts show; grid only.                   |
| `height`    | `"fill" \| "auto"`                 | `"fill"`    | Fill the container, or size to the rows up to `maxHeight`; grid only. |
| `maxHeight` | `number`                           | `480`       | The tallest an `auto` grid's rows grow before they scroll; grid only. |

`<px-chart>`:

| Input       | Type                          | Default   | Meaning                                                                  |
| ----------- | ----------------------------- | --------- | ------------------------------------------------------------------------ |
| `layout`    | `LayoutInput`                 | required  | The view and its `chart` section. Two-way: `[(layout)]`.                 |
| `theme`     | `ParallaxTheme`               | standard  | A theme from `defineTheme`; by default `provideParallax`'s.              |
| `scheme`    | `"light" \| "dark" \| "auto"` | `"light"` | The colour scheme; `auto` follows the system. Default as `theme`.        |
| `sync`      | `string \| null`              | automatic | The group whose crosshairs move together; `null` keeps this chart's own. |
| `statusBar` | `boolean`                     | `true`    | Whether the status bar shows under the chart.                            |

## Outputs

| Output            | Of              | Emits                                                              |
| ----------------- | --------------- | ------------------------------------------------------------------ |
| `layoutChange`    | every component | The edited layout, for `[(layout)]`.                               |
| `drill`           | `<px-grid>`     | A pivot cell double-clicked, with its group path.                  |
| `brushed`         | `<px-chart>`    | The filters of a range brushed with Shift and drag, or `null`.     |
| `selectionChange` | `<px-chart>`    | The group of a bar or slice clicked, or `null` when it is cleared. |

## Keys

| Key                                   | Action                                                       |
| ------------------------------------- | ------------------------------------------------------------ |
| Arrows, Page Up, Page Down, Home, End | Move the selection; Shift extends it, Ctrl jumps to the edge |
| Ctrl+A                                | Select every cell                                            |
| Ctrl+F                                | Put the cursor in the grid's search                          |
| Alt+Down                              | Open the focused column's menu                               |
| Ctrl+C                                | Copy the selection as tab-separated text with every digit    |
| Enter or Space on a group             | Expand or collapse it                                        |
| Escape                                | Clear the selection                                          |

## Theme tokens

Every colour, font, size and border is a CSS custom property, such as
`--px-accent`, `--px-font-family`, `--px-spacing` and `--px-row-height`;
`TOKEN_PROPERTIES` lists them all.
Set any of them anywhere, on `:root`, on a wrapper or on the element, and it
wins over the theme:

```css
:root {
  --px-negative: #c00;
  --px-font-family: "IBM Plex Sans", sans-serif;
}
```

Most tokens derive from a few: set `--px-accent`, `--px-background` and
`--px-foreground`, and the borders, header, stripes, selection, focus rings
and chips follow. A value may be any CSS colour, `color-mix()` or
`light-dark()`, which follows the component's scheme. Grids and pivots have a
rounded frame; `--px-wrapper-border: none` removes it, as for a grid inside a
card of your own.

`defineTheme` makes a named theme from values for both schemes or for one,
optionally extending another theme. Give it to a component's `theme` input, or
to `provideParallax({ theme, scheme })` for every component:

```ts
export const acme = defineTheme({ name: "acme", params: { accent: "#7c3aed", radius: 8 }, dark: { accent: "#a78bfa" } });
```

The library ships two themes: `standardTheme`, dense and the default, and
`airyTheme`, with taller rows, wider padding and a rule between rows instead
of stripes. A theme can extend either (`extends: airyTheme`), and a value can
refer to another token with `token()`, such as
`` `color-mix(in srgb, ${token("accent")} 10%, ${token("background")})` ``.

[Themes](../../../docs/theming.md) lists every token with its defaults.

The components read their tokens again when their inputs change, when an
attribute of `<html>` or `<body>` changes (such as a dark class), when the
system's colour scheme changes and when fonts load. After changing a token any
other way, call `refreshTheme()` on the component.
