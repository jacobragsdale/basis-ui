/**
 * The grid's toolbar: a search box, a chip for each filter with Clear all, and Export. Each edit goes out as a new
 * layout, which the grid sends to the engine; the toolbar keeps no state of its own.
 */

import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input, output, viewChild } from "@angular/core";

import type { Layout } from "../layout";
import { ExportButtonComponent } from "../ui/export-button.component";
import { IconComponent } from "../ui/icon.component";
import { ColumnToolsComponent } from "./column-tools.component";
import { searchColumns, withAllExpanded, withSearch } from "./edit";
import { FilterChipsComponent } from "./filter-chips.component";
import type { SourceField } from "./grid-source";
import { SearchBoxComponent } from "./search-box.component";

/** Which parts of the toolbar show. A grid in a small tile can turn some, or the whole toolbar, off. */
export interface ToolbarParts {
  readonly search: boolean;
  readonly chips: boolean;
  /** The column chooser; a pivot, whose columns are its measures, has none. */
  readonly columns: boolean;
  /** The totals row's switch; a pivot has its grand total instead. */
  readonly totals: boolean;
  readonly export: boolean;
  /** The strip above the grid where its groups show, and headers are dropped to group by them. */
  readonly group: boolean;
  /** Expand all and Collapse all, for a pivot's groups; a grid's groups have them in the group panel. */
  readonly expand: boolean;
}

/** Every part shown. */
export const ALL_PARTS: ToolbarParts = { search: true, chips: true, columns: true, totals: true, export: true, group: true, expand: true };

/** The toolbar's look, shared by grids and pivots. */
const TOOLBAR_STYLES = `
  .px-toolbar {
    container-type: inline-size;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--_px-spacing) * 1.5);
    padding: calc(var(--_px-spacing) * 1.5) calc(var(--_px-spacing) * 2);
    border-bottom: 1px solid var(--_px-border-color);
    background: var(--_px-background);
    color: var(--_px-foreground);
    font: var(--_px-font-size) var(--_px-font-family);
  }
  .px-toolbar .px-spring {
    flex: 1;
  }
  .px-toolbar .px-chips,
  .px-toolbar .px-column-tools {
    display: contents;
  }
  .px-toolbar button[aria-pressed="true"] {
    border-color: color-mix(in srgb, var(--_px-accent) 45%, transparent);
    background: var(--_px-chip-background);
    color: var(--_px-accent);
  }
  /* A narrow toolbar keeps its buttons' icons and drops their words, so that it stays on one line. */
  @container (max-width: 560px) {
    .px-toolbar .px-label {
      display: none;
    }
    .px-toolbar button {
      padding: 0 calc(var(--_px-spacing) * 1.75);
    }
  }
  .px-toolbar .px-search {
    display: flex;
    align-items: center;
    gap: calc(var(--_px-spacing) * 1.5);
    flex: 0 1 240px;
    min-width: 140px;
    height: var(--_px-control-height);
    padding: 0 calc(var(--_px-spacing) * 1.5) 0 calc(var(--_px-spacing) * 2);
    border: 1px solid var(--_px-control-border);
    border-radius: var(--_px-radius);
    background: var(--_px-control-background);
    color: var(--_px-muted);
  }
  .px-toolbar .px-search:focus-within {
    border-color: var(--_px-accent);
    box-shadow: 0 0 0 3px var(--_px-focus);
  }
  .px-toolbar .px-search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--_px-control-foreground);
    font: inherit;
  }
  .px-toolbar .px-search input::-webkit-search-cancel-button {
    display: none;
  }
  .px-toolbar button {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--_px-spacing) * 1.5);
    height: var(--_px-control-height);
    padding: 0 calc(var(--_px-spacing) * 2.5);
    border: 1px solid var(--_px-control-border);
    border-radius: var(--_px-radius);
    background: var(--_px-control-background);
    color: var(--_px-control-foreground);
    font: inherit;
    cursor: pointer;
  }
  .px-toolbar button:hover {
    background: var(--_px-control-hover);
  }
  .px-toolbar button[aria-pressed="true"]:hover {
    background: var(--_px-chip-background);
  }
  .px-toolbar button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--_px-focus);
  }
  .px-toolbar .px-icon-button {
    width: 22px;
    height: 22px;
    padding: 0;
    justify-content: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
  }
  .px-toolbar .px-split {
    display: inline-flex;
  }
  .px-toolbar .px-split > button:first-child {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .px-toolbar .px-split > button:last-child {
    margin-left: -1px;
    padding: 0 calc(var(--_px-spacing) * 1.5);
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  .px-toolbar .px-chip {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--_px-spacing) * 0.5);
    max-width: 320px;
    height: 24px;
    padding: 0 calc(var(--_px-spacing) * 0.5) 0 calc(var(--_px-spacing) * 2.5);
    border-radius: 12px;
    background: var(--_px-chip-background);
    color: var(--_px-control-foreground);
    font-size: var(--_px-font-size-small);
  }
  .px-toolbar .px-chip > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .px-toolbar .px-chip .px-icon-button {
    width: 20px;
    height: 20px;
  }
  .px-toolbar .px-link {
    height: 24px;
    padding: 0 calc(var(--_px-spacing) * 1.5);
    border: 0;
    background: transparent;
    color: var(--_px-accent);
  }
  .px-toolbar .px-link:hover {
    background: transparent;
    text-decoration: underline;
  }
`;

@Component({
  selector: "px-grid-toolbar",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [ColumnToolsComponent, ExportButtonComponent, FilterChipsComponent, IconComponent, SearchBoxComponent],
  host: { class: "px-toolbar", role: "toolbar", "aria-label": "Grid tools" },
  styles: TOOLBAR_STYLES,
  template: `
    @if (showSearch()) {
      <px-search-box #search [text]="layout().search" [hint]="searchTitle()" (changed)="changed.emit(withSearch(layout(), $event))" />
    }
    @if (parts().chips) {
      <px-filter-chips [layout]="layout()" (changed)="changed.emit($event)" />
    }
    <span class="px-spring"></span>
    @if (expandable()) {
      <button type="button" aria-label="Expand all" (click)="changed.emit(withAllExpanded(layout(), true))"><px-icon name="expand" /><span class="px-label">Expand all</span></button>
      <button type="button" aria-label="Collapse all" (click)="changed.emit(withAllExpanded(layout(), false))"><px-icon name="collapse" /><span class="px-label">Collapse all</span></button>
    }
    <ng-content />
    <px-column-tools [layout]="layout()" [fields]="fields()" [columns]="parts().columns" [totals]="parts().totals" (changed)="changed.emit($event)" />
    @if (parts().export) {
      <px-export-button (exported)="exported.emit($event)" />
    }
  `
})
export class GridToolbarComponent {
  /** The grid's layout. */
  public readonly layout = input.required<Layout>();
  /** The dataset's columns. */
  public readonly fields = input.required<readonly SourceField[]>();
  /** Which parts show. */
  public readonly parts = input<ToolbarParts>(ALL_PARTS);
  /** Fires with each edited layout. */
  public readonly changed = output<Layout>();
  /** Fires when the user asks for an export, with its format. */
  public readonly exported = output<"xlsx" | "csv">();

  protected readonly withSearch = withSearch;
  protected readonly withAllExpanded = withAllExpanded;
  /** A pivot's groups open and close from here; a grid's, from its group panel. */
  protected readonly expandable = computed(() => this.parts().expand && this.layout().group_by.length > 0 && !this.layout().detail);
  private readonly searchBox = viewChild<SearchBoxComponent>("search");

  private readonly searched = computed(() => searchColumns(this.layout(), this.fields()));
  /** The search shows where there is text to search, and whenever a search is set, so that it can be cleared. */
  protected readonly showSearch = computed(() => this.parts().search && (this.searched().length > 0 || this.layout().search !== ""));
  protected readonly searchTitle = computed(() => {
    const titles = this.layout().titles;
    const names = this.searched().map((c) => titles[c] ?? c);
    return names.length === 0 ? "Nothing here is text to search" : `Searches ${names.join(", ")}`;
  });

  /** Puts the cursor in the search box, as Ctrl+F does. Returns whether there is a box. */
  public focusSearch(): boolean {
    const box = this.searchBox();
    box?.focus();
    return box !== undefined;
  }
}
