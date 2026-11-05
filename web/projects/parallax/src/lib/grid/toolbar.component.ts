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
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--px-grid-line);
    background: var(--px-grid-bg);
    color: var(--px-grid-fg);
    font: var(--px-font);
  }
  .px-toolbar .px-spring {
    flex: 1;
  }
  .px-toolbar .px-chips,
  .px-toolbar .px-column-tools {
    display: contents;
  }
  .px-toolbar button[aria-pressed="true"] {
    border-color: var(--px-accent);
    color: var(--px-accent);
  }
  .px-toolbar .px-search {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 1 240px;
    min-width: 140px;
    height: 28px;
    padding: 0 6px 0 8px;
    border: 1px solid var(--px-control-border);
    border-radius: var(--px-radius);
    background: var(--px-control-bg);
    color: var(--px-muted-fg);
  }
  .px-toolbar .px-search:focus-within {
    border-color: var(--px-accent);
    box-shadow: 0 0 0 3px var(--px-focus);
  }
  .px-toolbar .px-search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--px-control-fg);
    font: inherit;
  }
  .px-toolbar .px-search input::-webkit-search-cancel-button {
    display: none;
  }
  .px-toolbar button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--px-control-border);
    border-radius: var(--px-radius);
    background: var(--px-control-bg);
    color: var(--px-control-fg);
    font: inherit;
    cursor: pointer;
  }
  .px-toolbar button:hover {
    background: var(--px-control-hover);
  }
  .px-toolbar button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--px-focus);
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
    padding: 0 6px;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  .px-toolbar .px-chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    max-width: 320px;
    height: 24px;
    padding: 0 2px 0 10px;
    border-radius: 12px;
    background: var(--px-chip-bg);
    color: var(--px-control-fg);
    font-size: 12px;
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
    padding: 0 6px;
    border: 0;
    background: transparent;
    color: var(--px-accent);
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
      <button type="button" (click)="changed.emit(withAllExpanded(layout(), true))"><px-icon name="expand" />Expand all</button>
      <button type="button" (click)="changed.emit(withAllExpanded(layout(), false))"><px-icon name="collapse" />Collapse all</button>
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
