/**
 * `<px-pivot>`: a pivot table with its settings beside it. The settings edit the
 * same layout the grid shows, so `[(layout)]` keeps the host's copy current
 * whether the user changes a setting, sorts, resizes or expands a group. Double-
 * clicking a value opens the rows behind its group in a drawer below.
 */

import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, effect, input, model, signal, untracked, viewChild } from "@angular/core";

import type { DistinctValues } from "../connection";
import { GridComponent } from "../grid/grid.component";
import type { Density, DrawStats, DrillRequest } from "../grid/grid.component";
import type { ToolbarParts } from "../grid/toolbar.component";
import { checkLayout } from "../layout";
import type { Layout, LayoutInput } from "../layout";
import type { ParallaxTheme, Scheme } from "../theme";
import { themed } from "../theming";
import { drillLayout } from "./edit";
import { PivotPanelComponent } from "./pivot-panel.component";
import type { ValueSource } from "./value-picker.component";

/** What decides the rows behind a group: the dataset, filters and groups. */
function computedKey(layout: Layout): string {
  return JSON.stringify([layout.dataset, layout.parameters, layout.filters, layout.group_by, layout.split_by]);
}

const PIVOT_STYLES = `
  px-pivot {
    display: flex;
    height: 100%;
    min-height: 0;
    font: var(--_px-font-size) var(--_px-font-family);
    color: var(--_px-foreground);
    background: var(--_px-background);
  }
  px-pivot .px-pivot-side {
    display: flex;
    flex-direction: column;
    width: 300px;
    min-width: 300px;
    border-right: 1px solid var(--_px-border-color);
    background: var(--_px-status-background);
  }
  px-pivot .px-pivot-side[data-open="false"] {
    width: 28px;
    min-width: 28px;
  }
  px-pivot .px-pivot-toggle {
    align-self: flex-end;
    margin: 4px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  px-pivot px-pivot-panel {
    display: block;
    overflow: auto;
    padding: 0 10px 10px;
  }
  px-pivot px-pivot-panel h3 {
    margin: 12px 0 6px;
    color: var(--_px-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  px-pivot .px-muted {
    color: var(--_px-muted);
  }
  px-pivot .px-pivot-hint {
    margin: 8px 0 0;
    font-size: 12px;
  }
  px-pivot button,
  px-pivot select,
  px-pivot input {
    font: inherit;
    color: inherit;
  }
  px-pivot select,
  px-pivot input:not([type="checkbox"]) {
    max-width: 100%;
    padding: 2px 4px;
    border: 1px solid var(--_px-control-border);
    border-radius: calc(var(--_px-radius) - 2px);
    background: var(--_px-control-background);
    color: var(--_px-control-foreground);
  }
  px-pivot button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  px-pivot .px-field-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
  }
  px-pivot .px-field-search {
    height: 28px;
  }
  px-pivot .px-field-list ul {
    max-height: 220px;
    overflow: auto;
    margin: 0;
    padding: 2px 0;
    border: 1px solid var(--_px-border-color);
    border-radius: var(--_px-radius);
    background: var(--_px-background);
    list-style: none;
  }
  px-pivot .px-field {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 1px 4px 1px 6px;
    cursor: grab;
  }
  px-pivot .px-field:hover {
    background: var(--_px-control-hover);
  }
  px-pivot .px-field label {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  px-pivot .px-field label span,
  px-pivot .px-chip span,
  px-pivot .px-chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  px-pivot .px-field-areas {
    color: var(--_px-muted);
    font-size: 11px;
  }
  px-pivot .px-well h3 {
    margin: 10px 0 4px;
  }
  px-pivot .px-well-chips {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-height: 30px;
    margin: 0;
    padding: 3px;
    border: 1px dashed var(--_px-border-color);
    border-radius: var(--_px-radius);
    list-style: none;
  }
  px-pivot .px-well-chips[data-drop="true"] {
    border-color: var(--_px-accent);
    background: var(--_px-chip-background);
  }
  px-pivot .px-well-empty {
    padding: 4px 6px;
    color: var(--_px-muted);
    font-size: 12px;
  }
  px-pivot .px-chip {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 26px;
    padding: 0 2px 0 4px;
    border: 1px solid var(--_px-control-border);
    border-radius: calc(var(--_px-radius) - 2px);
    background: var(--_px-control-background);
    color: var(--_px-control-foreground);
    cursor: grab;
  }
  px-pivot .px-chip > span,
  px-pivot .px-chip-text {
    flex: 1;
    min-width: 0;
  }
  px-pivot .px-chip > .px-icon:first-child {
    color: var(--_px-muted);
  }
  px-pivot .px-drop-before {
    box-shadow: 0 -2px 0 var(--_px-accent);
  }
  px-pivot .px-drop-end {
    box-shadow: inset 0 -2px 0 var(--_px-accent);
  }
  px-pivot .px-chip-text {
    padding: 0 4px;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  px-pivot .px-chip-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
  }
  px-pivot .px-chip-button:hover {
    background: var(--_px-control-hover);
  }
  px-pivot .px-option {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  px-pivot .px-option input[type="number"] {
    width: 56px;
  }
  px-pivot .px-pivot-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  px-pivot .px-pivot-main > px-grid {
    flex: 1;
  }
  px-pivot .px-drill {
    display: flex;
    flex-direction: column;
    height: 40%;
    min-height: 160px;
    border-top: 2px solid var(--_px-selection-border);
  }
  px-pivot .px-drill header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    background: var(--_px-header-background);
    color: var(--_px-header-foreground);
  }
  px-pivot .px-drill header span {
    flex: 1;
  }
  px-pivot .px-drill header button {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  px-pivot .px-drill px-grid {
    flex: 1;
  }
`;

@Component({
  selector: "px-pivot",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [GridComponent, PivotPanelComponent],
  host: { "[attr.data-px-theme]": "theming.theme().name", "[attr.data-px-scheme]": "theming.resolved()" },
  template: `
    <aside class="px-pivot-side" [attr.data-open]="panelOpen()">
      <button type="button" class="px-pivot-toggle" [attr.aria-expanded]="panelOpen()" [attr.aria-label]="panelOpen() ? 'Hide settings' : 'Show settings'" (click)="panelOpen.set(!panelOpen())">
        {{ panelOpen() ? "«" : "»" }}
      </button>
      @if (panelOpen() && current(); as active) {
        <px-pivot-panel [layout]="active" [fields]="grid.fields()" [source]="values" (changed)="layout.set($event)" />
      }
    </aside>
    <div class="px-pivot-main">
      <px-grid #grid [(layout)]="layout" [theme]="theming.theme()" [scheme]="theming.scheme()" [density]="density()" (drill)="openDrill($event)" />
      @if (drill(); as d) {
        <section class="px-drill" aria-label="Rows behind the group">
          <header>
            <span>Rows behind {{ d.label }}</span>
            <button type="button" aria-label="Close" (click)="drill.set(null)">×</button>
          </header>
          <px-grid #drillGrid [layout]="d.layout" [theme]="theming.theme()" [scheme]="theming.scheme()" [density]="density()" [toolbar]="drillTools" (layoutChange)="updateDrill($event)" />
        </section>
      }
    </div>
  `,
  styles: PIVOT_STYLES
})
export class PivotComponent {
  /** The view. Bind it two ways with `[(layout)]`. */
  public readonly layout = model.required<LayoutInput>();
  /** The theme, from `defineTheme`; by default the one given to `provideParallax`, else the standard theme. A token set in CSS wins over it. */
  public readonly theme = input<ParallaxTheme | undefined>(undefined);
  /** The light or dark scheme, or `auto` to follow the system; by default the one given to `provideParallax`, else light. */
  public readonly scheme = input<Scheme | undefined>(undefined);
  /** The theme and scheme in effect, which the pivot's grids share. */
  protected readonly theming = themed(this.theme, this.scheme);
  /** How tightly rows are packed. */
  public readonly density = input<Density>("compact");

  private readonly gridRef = viewChild.required<GridComponent>("grid");
  private readonly drillGridRef = viewChild<GridComponent>("drillGrid");

  /** The grid's drawing counters. */
  public drawStats(): DrawStats {
    return this.gridRef().drawStats();
  }

  /**
   * Reads the theme's tokens again and redraws if they changed. The pivot notices its inputs, the system's colour
   * scheme, fonts loading and changes to the attributes of `<html>` and `<body>` by itself; call this after changing
   * a token any other way, such as a class on a wrapper.
   */
  public refreshTheme(): void {
    this.gridRef().refreshTheme();
    this.drillGridRef()?.refreshTheme();
  }
  protected readonly panelOpen = signal(true);
  /**
   * The drawer's rows are found, searched and exported from its toolbar. Its filters are what put the rows behind the
   * group, so they show in the drawer's title rather than as chips to remove, and its rows aren't grouped again.
   */
  protected readonly drillTools: Partial<ToolbarParts> = { chips: false, group: false };
  protected readonly drill = signal<{ readonly label: string; readonly layout: Layout; readonly source: string } | null>(null);
  protected readonly current = computed((): Layout | null => {
    const checked = checkLayout(this.layout());
    return checked.ok ? checked.layout : null;
  });
  /** Lists values for filter pick-lists from the grid's view. */
  protected readonly values: ValueSource = (column: string, search: string, limit: number): Promise<DistinctValues> => this.gridRef().distinctValues(column, search, limit);

  constructor() {
    // The drawer's rows follow from the pivot's filters and groups; once those
    // change it would show rows that no longer add up to the cells above, so it closes.
    effect(() => {
      const layout = this.current();
      const open = untracked(() => this.drill());
      if (open !== null && (layout === null || computedKey(layout) !== open.source)) {
        this.drill.set(null);
      }
    });
  }

  protected updateDrill(layout: LayoutInput): void {
    const open = this.drill();
    const checked = checkLayout(layout);
    if (open !== null && checked.ok) {
      this.drill.set({ ...open, layout: checked.layout });
    }
  }

  protected openDrill(request: DrillRequest): void {
    const layout = this.current();
    if (layout !== null) {
      this.drill.set({ label: request.label, layout: drillLayout(layout, request.path, request.split), source: computedKey(layout) });
    }
  }
}
