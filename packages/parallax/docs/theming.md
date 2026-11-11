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

A basis-ui app's themes are `@basis/ui`'s, which its user picks from the user
menu, and whoever ports a brand makes one in the gallery's **Theme studio**,
which edits `@basis/ui`'s theme inputs, checks them, and exports the inputs
file; every canvas follows the theme through `basisTheme`.

### Set tokens in CSS

1. In your application's global stylesheet, set the tokens you want on
   `:root`, on a wrapper around the components, or on the components
   themselves:

   ```css
   :root {
     --px-accent: #7c3aed;
     --px-font-family: "IBM Plex Sans", system-ui, sans-serif;
     --px-font-size: 14px;
     --px-row-height: 28px;
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
   only when it is told they may have changed:
   - an attribute of `<html>` or `<body>` changes, as `@basis/ui`'s mode,
     density and theme do;
   - `data-theme` or `data-density` changes on any element, or its class gains
     or loses `dark`, as on a wrapper that shows another theme;
   - a stylesheet is added to or taken from the head;
   - `@basis/ui`'s `themeChangeEvent`, `basis:themechange`, reaches the
     document. `applyPreferences` dispatches it, and code that changes tokens
     in a way none of the above shows, such as a variable set on a wrapper's
     style, dispatches it on the document itself:
     `document.dispatchEvent(new Event(themeChangeEvent))`;
   - the system's colour scheme changes, or a font loads.

   A canvas then draws again whole, and a grid fits its columns again if the
   font, the cell padding or the header's icons changed.

### Define a named theme

1. Make the theme with `defineTheme`. Values in `params` apply in both
   schemes, and `light` and `dark` override them for one scheme. Lengths can
   be numbers of pixels. `token()` refers to another token's value:

   ```ts
   import { basisTheme, defineTheme, token } from "@basis/parallax";

   export const acme = defineTheme({
     name: "acme",
     extends: basisTheme,
     params: {
       accent: "#7c3aed",
       barRadius: 2,
       rowBorder: `color-mix(in srgb, ${token("accent")} 15%, ${token("background")})`
     },
     dark: { accent: "#a78bfa" }
   });
   ```

   A theme's name must be lowercase letters, digits and hyphens, or
   `defineTheme` throws. A name is one theme on a page: a theme defined again
   under a name already installed replaces it there, as a theme edited while
   the page runs does.

2. Give the theme to every component under the provider, with the scheme,
   which follows `@basis/ui`'s mode by default:

   ```tsx
   <ParallaxProvider theme={acme}>
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

`basisTheme` sizes the grid by `@basis/ui`'s control lengths, which follow
its density: a row is a medium control's height, `--control-md-height`, 28 px
compact and 32 comfortable; the header a large control's, 30 and 36; a cell's
padding a medium control's inset, and the header's icons its icon size. So a
control fits a row, and the grid is as dense as the page's forms. A theme that
sets `rowHeight` as a number keeps that height in both densities.

### Numbers that line up on the canvas

A canvas's font cannot ask for tabular figures, as `tabular-nums` does in the
DOM, so a canvas draws a face's default figures, which in most faces are
proportional: a column of numbers is ragged. Name a face whose figures are
tabular by default in `--px-font-family`. A face of your own can be declared
again under another name with the feature on, which Chrome honours from
version 139:

```css
@font-face {
  font-family: "Plex Tabular";
  src: url("./fonts/IBMPlexSans-Regular.woff2") format("woff2");
  font-feature-settings: "tnum";
}

:root {
  --px-font-family: "Plex Tabular", "IBM Plex Sans", system-ui, sans-serif;
}
```

`basisTheme` does this with `@basis/ui`'s `--font-num`, its Inter declared
again as `Inter Tabular`. It draws at `@basis/ui`'s text sizes, so the
canvas's numbers are the size of the DOM's: `--text-sm`, 14 px, a table's,
for cells and headers, and `--text-xs`, 12 px, the charts' readouts', for
axes and labels.

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
| `--px-row-height` | `rowHeight` | length | `24px` | same | A grid row. `basisTheme`'s is `--control-md-height`. |
| `--px-muted` | `muted` | colour | `#667085` | `#8a93a3` | Secondary text: hints, counts, axis labels, resting funnels and flagged cells. |
| `--px-negative` | `negative` | colour | `#b42318` | `#ff7b72` | Numbers below zero. |
| `--px-positive` | `positive` | colour | `#1a7f37` | `#56d364` | A gain: a badge's and a rule's ink, a data bar above zero. |
| `--px-warning` | `warning` | colour | `#9a6700` | `#e3b341` | A badge's and a rule's warning ink. |
| `--px-info` | `info` | colour | `#0969da` | `#79c0ff` | A badge's and a rule's note ink. |
| `--px-positive-subtle` | `positiveSubtle` | colour | 14 % of `positive` over `background` | 22 % | Behind a positive badge's text and a rule's fill. |
| `--px-negative-subtle` | `negativeSubtle` | colour | 14 % of `negative` over `background` | 22 % | As above, for a loss. |
| `--px-warning-subtle` | `warningSubtle` | colour | 14 % of `warning` over `background` | 22 % | As above, for a warning. |
| `--px-info-subtle` | `infoSubtle` | colour | 14 % of `info` over `background` | 22 % | As above, for a note. |
| `--px-highlight` | `highlight` | colour | `#ffe58a` | `rgba(255, 214, 10, 0.38)` | Behind text that matches a search. |
| `--px-on-accent` | `onAccent` | colour | `#ffffff` | `#0b1220` | Text on the accent: a pressed toolbar button's, a drop target's. |
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
| `--px-control-background` | `controlBackground` | colour | `--px-background` | same | Buttons, inputs and selects. |
| `--px-control-border` | `controlBorder` | colour | `--px-foreground` 18% in `--px-background` | `--px-foreground` 22% in `--px-background` | Borders of buttons, inputs and selects. |
| `--px-control-hover` | `controlHover` | colour | `--px-foreground` 6% in `--px-background` | `--px-foreground` 9% in `--px-background` | Behind a control, menu item or header under the pointer. |
| `--px-scrollbar` | `scrollbar` | colour | `--px-foreground` 25% in `--px-background` | `--px-foreground` 30% in `--px-background` | Scrollbar thumbs. |
| `--px-header-height` | `headerHeight` | length | `--px-row-height` + 6 px | same | The grid's header. `basisTheme`'s is `--control-lg-height`. |
| `--px-cell-padding` | `cellPadding` | length | 2 × `--px-spacing` | same | Between a cell's edge and its text. |
| `--px-indent` | `indent` | length | `14px` | same | Each level of a group column's tree. |
| `--px-icon-size` | `iconSize` | length | `14px` | same | The grid's header's icons: the funnel, the pin and a measure's chevron. |
| `--px-font-size-small` | `fontSizeSmall` | length | `--px-font-size` − 1 px | same | A chart's axis labels, legends and data labels. |
| `--px-column-border` | `columnBorder` | colour | `--px-foreground` 7% in `--px-background` | `--px-foreground` 9% in `--px-background` | Between columns. `transparent` draws none. |
| `--px-row-border` | `rowBorder` | colour | `transparent` | same | Between rows. `transparent` draws none. |
| `--px-header-border` | `headerBorder` | colour | `--px-border-color` | same | Under the header. |
| `--px-total-border` | `totalBorder` | colour | `--px-foreground` 22% in `--px-background` | `--px-foreground` 26% in `--px-background` | Over the totals row. |
| `--px-gridline` | `gridline` | colour | `--px-foreground` 8% in `--px-background` | `--px-foreground` 11% in `--px-background` | A chart's gridlines. |
| `--px-line-height-small` | `lineHeightSmall` | length | `--px-font-size-small` + 4 px | same | How far apart a label's lines sit, and the room a label takes where labels stack. |
| `--px-selection-width` | `selectionWidth` | length | `2px` | same | The focused cell's ring. `basisTheme`'s is the focus ring's, `--focus-width`. |
| `--px-selection-radius` | `selectionRadius` | length | `2px` | same | The focused cell's ring's corners. |
| `--px-line-width` | `lineWidth` | length | `2px` | same | A series' line in a line or area chart. |
| `--px-bar-radius` | `barRadius` | length | `4px` | same | The rounded data end of a bar or a column. `basisTheme`'s is `--radius-sm`. |
| `--px-light-ink` | `lightInk` | colour | `#ffffff` | same | A label on a dark bar or slice. |
| `--px-dark-ink` | `darkInk` | colour | `#111827` | same | A label on a light bar or slice; a label takes whichever ink has the more contrast. |

### Chart colours

| Property | Parameter | Light default | Dark default | Styles |
|---|---|---|---|---|
| `--px-series-1` to `--px-series-8` | `series`, a list | eight colours from `#2a78d6` | eight colours from `#3c7dde` | Series and groups, in order; past the eighth, the muted colour. |
| `--px-up`, `--px-down` | `up`, `down` | `oklch(0.46 0.1267 150)`, `oklch(0.36 0.1459 25)` | `oklch(0.86 0.16 150)`, `oklch(0.75 0.1505 25)` | Candles, OHLC bars and volume that close up or down. |
| `--px-ramp-1` to `--px-ramp-9` | `ramp`, a list | nine OKLCH steps of hue 245, from `oklch(0.93 0.0361 245)` to `oklch(0.37 0.0931 245)` | nine steps from `oklch(0.27 0.0679 245)` to `oklch(0.83 0.091 245)` | Densities and heatmaps, from least to most. |
| `--px-middle` | `middle` | `oklch(0.935 0.0034 255)` | `oklch(0.348 0.0056 255)` | A heatmap's zero when values take both signs. |
| `--px-negative-ramp-1` to `--px-negative-ramp-5` | `negativeRamp`, a list | five OKLCH steps of hue 25, from `oklch(0.82 0.1008 25)` to `oklch(0.42 0.1703 25)` | five steps from `oklch(0.42 0.1703 25)` to `oklch(0.82 0.1008 25)` | A heatmap's negative values, from least to most. |

The categorical order is checked for colour-vision deficiency on each scheme's
surface. A theme that replaces `series` should check its own.

### Built-in themes

| Theme | Name | Look |
|---|---|---|
| `basisTheme` | `basis` | Every token from `@basis/ui`'s theme, its mode and its density; `ParallaxProvider`'s default. |

The defaults in the tables above draw when no theme applies, as before the
stylesheet loads.
