# Themes

Grids, pivots and charts draw every colour, font, size and border from design
tokens: CSS custom properties named `--px-*`. A theme is a set of values for
some of them. For why the tokens work as they do, see
[How parallax is designed](design.md#themes).

## How to apply your own theme

Set tokens in CSS for the quickest route, or define a named theme in
TypeScript to type-check it and give it to the components under a provider.
Both take effect on the canvases of every grid, pivot and chart they reach.
`basisTheme`, the default, takes every token from `@basis/ui`'s theme, which a
basis-ui app does not change; the grid's toolbar, menus and status bar, the
pivot's settings and the charts' chrome are `@basis/ui`'s components, and keep
its theme whatever the tokens say.

To start from a theme you can see, open the demo's **Theme studio**, set the
accent, background, text, font, sizes and lines, and copy the result with
**Copy CSS** or **Copy TypeScript**.

### Set tokens in CSS

1. In your application's global stylesheet, set the tokens you want on
   `:root`, on a wrapper around the components, or on the components
   themselves:

   ```css
   :root {
     --px-accent: #7c3aed;
     --px-font-family: "IBM Plex Sans", system-ui, sans-serif;
     --px-font-size: 14px;
     --px-radius: 8px;
   }
   ```

   Colours derived from the accent, background and foreground follow them:
   selections, focus rings, chips, borders, stripes and the header.

2. To give the dark scheme its own value, write it with `light-dark()`, which
   follows each component's scheme:

   ```css
   :root {
     --px-accent: light-dark(#7c3aed, #a78bfa);
   }
   ```

3. Change tokens while the application runs through an attribute of `<html>`
   or `<body>`, such as a class or a style there. The canvas reads its tokens
   only when it is told they may have changed: when an attribute of `<html>`
   or `<body>` changes, as `@basis/ui`'s mode and density do, when the
   system's colour scheme changes, and when a font loads.

### Define a named theme

1. Make the theme with `defineTheme`. Values in `params` apply in both
   schemes, and `light` and `dark` override them for one scheme. Lengths can
   be numbers of pixels. `token()` refers to another token's value:

   ```ts
   import { airyTheme, defineTheme, token } from "@basis/parallax";

   export const acme = defineTheme({
     name: "acme",
     extends: airyTheme,
     params: {
       accent: "#7c3aed",
       radius: 8,
       rowBorder: `color-mix(in srgb, ${token("accent")} 15%, ${token("background")})`
     },
     dark: { accent: "#a78bfa" }
   });
   ```

   A theme's name must be lowercase letters, digits and hyphens, and two
   different themes can't share one: `defineTheme` throws.

2. Give the theme to every component under the provider, with the scheme,
   which follows `@basis/ui`'s mode by default:

   ```tsx
   <ParallaxProvider worker={startParallax} theme={acme}>
     <Positions />
   </ParallaxProvider>
   ```

To confirm the theme applies, inspect a grid's element in the browser's
developer tools: its computed `--_px-accent` is your accent, and its
`data-px-theme` attribute names your theme.

## Tokens

The tokens below are every one that grids, pivots and charts read, as of
milestone 5. `tokenProperties` lists the same properties in code.

### Precedence

A token's value is the first of these that is set:

1. The `--px-*` property, set in CSS on the component or any element around
   it.
2. The theme's value for the component's scheme.
3. The default for the component's scheme, in the tables below.

A default derived from other tokens, such as "`--px-foreground` 12% in
`--px-background`", follows the values in effect for those tokens. A value
CSS refuses is ignored.

The comfortable density, `@basis/ui`'s, adds 6 px to `--px-row-height` and
`--px-header-height`, whoever set them.

### Colours, fonts and sizes

The parameter is the token's name in `defineTheme`'s `params`. A length
parameter can be a number of pixels.

| Property | Parameter | Kind | Light default | Dark default | Styles |
|---|---|---|---|---|---|
| `--px-accent` | `accent` | colour | `#2563eb` | `#5b9bff` | Pressed toolbar buttons, selections, focus rings, sort arrows, filtered funnels, drop targets and a pivot's grand total. |
| `--px-background` | `background` | colour | `#ffffff` | `#16181d` | The surface of grids, pivots and charts, and of their controls. |
| `--px-foreground` | `foreground` | colour | `#1d2330` | `#e3e6ec` | Text, and the base most derived colours are mixed from. |
| `--px-font-family` | `fontFamily` | font family | `system-ui, -apple-system, 'Segoe UI', sans-serif` | same | Every component's text, on the canvas and in the DOM. |
| `--px-font-size` | `fontSize` | length | `13px` | same | Body text in cells, headers, toolbars and menus. |
| `--px-spacing` | `spacing` | length | `4px` | same | The unit every gap, margin and padding in the toolbar, menus, panels and chart chrome is a multiple of. |
| `--px-radius` | `radius` | length | `6px` | same | Corners of buttons, inputs, chips and menu items. |
| `--px-row-height` | `rowHeight` | length | `24px` | same | A grid row. Comfortable density adds 6 px. |
| `--px-muted` | `muted` | colour | `#667085` | `#8a93a3` | Secondary text: hints, counts, axis labels, resting funnels and flagged cells. |
| `--px-negative` | `negative` | colour | `#b42318` | `#ff7b72` | Numbers below zero. |
| `--px-warning` | `warning` | colour | `#b54708` | `#e0a400` | The status bar's warning badge. |
| `--px-danger` | `danger` | colour | `#b42318` | `#ff7b72` | Error messages and the status bar's danger badge. |
| `--px-highlight` | `highlight` | colour | `#ffe58a` | `rgba(255, 214, 10, 0.38)` | Behind text that matches a search. |
| `--px-on-accent` | `onAccent` | colour | `#ffffff` | `#0b1220` | Text on the accent, warning and danger colours. |
| `--px-border-color` | `borderColor` | colour | `--px-foreground` 12% in `--px-background` | `--px-foreground` 16% in `--px-background` | Lines between parts: under the toolbar, around menus and panels, and the frame. |
| `--px-chrome-background` | `chromeBackground` | colour | `--px-foreground` 3% in `--px-background` | `--px-foreground` 5% in `--px-background` | Behind the header, the totals row, group rows, the status bar and the pivot's settings, through the tokens that default to it. |
| `--px-stripe` | `stripe` | colour | `--px-foreground` 2% in `--px-background` | `--px-foreground` 3% in `--px-background` | Behind every other row. `transparent` draws no stripes. |
| `--px-row-hover` | `rowHover` | colour | `--px-accent` 6% in `--px-background` | `--px-accent` 10% in `--px-background` | Behind the row under the pointer. `transparent` turns the highlight off, and the grid skips its repaint. |
| `--px-header-background` | `headerBackground` | colour | `--px-chrome-background` | same | Behind the grid's header. |
| `--px-header-foreground` | `headerForeground` | colour | `--px-foreground` 85% in `--px-background` | same | The header's titles. |
| `--px-header-font-weight` | `headerFontWeight` | weight | `600` | same | The header's titles, and section headings in menus and the pivot's settings. |
| `--px-total-foreground` | `totalForeground` | colour | `--px-accent` | same | A pivot's grand total label. |
| `--px-total-background` | `totalBackground` | colour | `--px-chrome-background` | same | Behind the totals row. |
| `--px-total-font-weight` | `totalFontWeight` | weight | `600` | same | The totals row's text. |
| `--px-group-font-weight` | `groupFontWeight` | weight | `600` | same | Group rows in a pivot or a grouped grid. |
| `--px-group-background` | `groupBackground` | colour | `--px-chrome-background` | same | Behind group rows in a grouped grid. A pivot's group rows keep the stripes. |
| `--px-selection-background` | `selectionBackground` | colour | `--px-accent` at 12% | `--px-accent` at 22% | Over selected cells. |
| `--px-selection-border` | `selectionBorder` | colour | `--px-accent` | same | The focused cell's ring. |
| `--px-status-background` | `statusBackground` | colour | `--px-chrome-background` | same | Behind the status bar. |
| `--px-status-foreground` | `statusForeground` | colour | `--px-foreground` 72% in `--px-background` | same | The status bar's text. |
| `--px-control-background` | `controlBackground` | colour | `--px-background` | same | Buttons, inputs and selects. |
| `--px-control-foreground` | `controlForeground` | colour | `--px-foreground` | same | Text in buttons, inputs and selects. |
| `--px-control-border` | `controlBorder` | colour | `--px-foreground` 18% in `--px-background` | `--px-foreground` 22% in `--px-background` | Borders of buttons, inputs and selects. |
| `--px-control-hover` | `controlHover` | colour | `--px-foreground` 6% in `--px-background` | `--px-foreground` 9% in `--px-background` | Behind a control, menu item or header under the pointer. |
| `--px-focus` | `focus` | colour | `--px-accent` at 35% | `--px-accent` at 45% | The ring around a focused control. |
| `--px-chip-background` | `chipBackground` | colour | `--px-accent` 10% in `--px-background` | `--px-accent` 20% in `--px-background` | Filter chips, pressed toolbar buttons and drop targets. |
| `--px-shadow` | `shadow` | shadow | `0 1px 2px rgba(16, 24, 40, 0.06), 0 8px 24px rgba(16, 24, 40, 0.14)` | `0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.5)` | Under popovers, menus and tooltips. |
| `--px-wrapper-border` | `wrapperBorder` | border | 1 px solid `--px-border-color` | same | A grid's and a pivot's frame. `none` removes it. |
| `--px-wrapper-radius` | `wrapperRadius` | length | `8px` | same | Corners of the frame, popovers and menus. |
| `--px-scrollbar` | `scrollbar` | colour | `--px-foreground` 25% in `--px-background` | `--px-foreground` 30% in `--px-background` | Scrollbar thumbs. |
| `--px-header-height` | `headerHeight` | length | `--px-row-height` + 6 px | same | The grid's header. Comfortable density adds 6 px. |
| `--px-cell-padding` | `cellPadding` | length | 2 × `--px-spacing` | same | Between a cell's edge and its text. |
| `--px-indent` | `indent` | length | `14px` | same | Each level of a group column's tree. |
| `--px-icon-size` | `iconSize` | length | `16px` | same | Icons in toolbars and menus. The header draws its icons at seven eighths of it. |
| `--px-control-height` | `controlHeight` | length | `28px` | same | Buttons, inputs and selects. |
| `--px-font-size-small` | `fontSizeSmall` | length | `--px-font-size` − 1 px | same | Status bars, chips, legends, axis labels and data labels. |
| `--px-column-border` | `columnBorder` | colour | `--px-foreground` 7% in `--px-background` | `--px-foreground` 9% in `--px-background` | Between columns. `transparent` draws none. |
| `--px-row-border` | `rowBorder` | colour | `transparent` | same | Between rows. `transparent` draws none. |
| `--px-header-border` | `headerBorder` | colour | `--px-border-color` | same | Under the header. |
| `--px-total-border` | `totalBorder` | colour | `--px-foreground` 22% in `--px-background` | `--px-foreground` 26% in `--px-background` | Over the totals row. |
| `--px-gridline` | `gridline` | colour | `--px-foreground` 8% in `--px-background` | `--px-foreground` 11% in `--px-background` | A chart's gridlines. |
| `--px-pinned-shadow` | `pinnedShadow` | colour | `--px-foreground` at 14% | `--px-foreground` at 40% | The shadow at the edge of pinned columns while others scroll under them. |

### Chart colours

| Property | Parameter | Light default | Dark default | Styles |
|---|---|---|---|---|
| `--px-series-1` to `--px-series-8` | `series`, a list | eight colours from `#2a78d6` | eight colours from `#3987e5` | Series and groups, in order; past the eighth, the muted colour. |
| `--px-up`, `--px-down` | `up`, `down` | `#1baf7a`, `#e34948` | `#199e70`, `#e66767` | Candles, OHLC bars and volume that close up or down. |
| `--px-ramp-1` to `--px-ramp-7` | `ramp`, a list | `#cde2fb` to `#0d366b` | `#0d366b` to `#cde2fb` | Densities and heatmaps, from least to most. |
| `--px-middle` | `middle` | `#f0efec` | `#383835` | A heatmap's zero when values take both signs. |
| `--px-negative-ramp-1` to `--px-negative-ramp-7` | `negativeRamp`, a list | `#fbd5d4` to `#701818` | `#5c1414` to `#f8cbca` | A heatmap's negative values, from least to most. |

The categorical order is checked for colour-vision deficiency on each scheme's
surface. A theme that replaces `series` should check its own.

### Built-in themes

| Theme | Name | Look |
|---|---|---|
| `standardTheme` | `standard` | The defaults above: dense, faint column lines and stripes. Used when no theme is given. |
| `airyTheme` | `airy` | 30 px rows, a 38 px header, 12 px cell padding, 5 px spacing, 32 px controls, rounder corners, no column lines or stripes, a hairline between rows, and the header on the background. |
