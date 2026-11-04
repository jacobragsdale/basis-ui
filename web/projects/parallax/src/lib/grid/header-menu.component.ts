/**
 * A column's menu, opened from its header's funnel or with Alt+Down: sorting, the column's filter, and hiding,
 * pinning, fitting, renaming and totalling the column. Every choice is a new layout.
 */

import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input, output } from "@angular/core";

import { ColumnFilterComponent } from "../filter/column-filter.component";
import type { Layout, LayoutMeasure } from "../layout";
import { label } from "../pivot/labels";
import type { ValueSource } from "../pivot/value-picker.component";
import { MenuComponent } from "../ui/menu.component";
import { totalChoices, totalOf, withHidden, withPinned, withSort, withTitle, withTotal } from "./edit";
import type { FieldKind, SourceField } from "./grid-source";

/** How each kind of column says its sort order. */
const ORDER: Readonly<Record<FieldKind, readonly [string, string]>> = {
  text: ["A to Z", "Z to A"],
  boolean: ["false first", "true first"],
  integer: ["smallest first", "largest first"],
  float: ["smallest first", "largest first"],
  decimal: ["smallest first", "largest first"],
  date: ["oldest first", "newest first"],
  timestamp: ["oldest first", "newest first"]
};

@Component({
  selector: "px-header-menu",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [ColumnFilterComponent, MenuComponent],
  host: { class: "px-header-menu", "[attr.aria-label]": "'Column ' + title()" },
  styles: `
    .px-header-menu {
      display: flex;
      flex-direction: column;
      width: 280px;
    }
    .px-header-menu hr {
      width: 100%;
      margin: 4px 0;
      border: 0;
      border-top: 1px solid var(--px-grid-line);
    }
    .px-header-menu .px-menu-heading {
      margin: 4px 10px 0;
      color: var(--px-muted-fg);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .px-header-menu .px-menu-fields {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 8px;
      align-items: center;
      padding: 4px 10px 6px;
    }
    .px-header-menu .px-menu-fields input,
    .px-header-menu .px-menu-fields select {
      height: 28px;
      min-width: 0;
      padding: 0 6px;
      border: 1px solid var(--px-control-border);
      border-radius: calc(var(--px-radius) - 2px);
      background: var(--px-control-bg);
      color: var(--px-control-fg);
      font: inherit;
    }
  `,
  template: `
    <px-menu>
      <button type="button" role="menuitem" (click)="sort(false)">
        Sort ascending<span class="px-menu-note">{{ order()[0] }}</span>
      </button>
      <button type="button" role="menuitem" (click)="sort(true)">
        Sort descending<span class="px-menu-note">{{ order()[1] }}</span>
      </button>
      <button type="button" role="menuitem" [disabled]="!sorted()" (click)="sort(null)">Clear sort</button>
    </px-menu>
    <hr />
    <p class="px-menu-heading">Filter</p>
    <px-column-filter [layout]="layout()" [column]="column()" [kind]="kind()" [source]="source()" (changed)="changed.emit($event)" />
    <hr />
    <px-menu>
      <button type="button" role="menuitem" (click)="finish(hide())">Hide column</button>
      <button type="button" role="menuitem" (click)="finish(pin())">{{ pinned() ? "Unpin" : "Pin to the left" }}</button>
      <button type="button" role="menuitem" (click)="fit.emit(); done.emit()">Fit width</button>
    </px-menu>
    <div class="px-menu-fields">
      <label for="px-title">Title</label>
      <input id="px-title" [value]="title()" (change)="rename($event)" />
      <label for="px-total">Total</label>
      <select id="px-total" [value]="total()" (change)="setTotal($event)">
        <option value="">None</option>
        @for (choice of totals(); track choice) {
          <option [value]="choice">{{ name(choice) }}</option>
        }
      </select>
    </div>
  `
})
export class HeaderMenuComponent {
  /** The grid's layout. */
  public readonly layout = input.required<Layout>();
  /** The column the menu is for. */
  public readonly column = input.required<string>();
  /** The dataset's columns. */
  public readonly fields = input.required<readonly SourceField[]>();
  /** Where the column's values come from, for its filter list. */
  public readonly source = input.required<ValueSource>();
  /** Fires with each edited layout. */
  public readonly changed = output<Layout>();
  /** Fires to fit the column to its values. */
  public readonly fit = output();
  /** Fires when a choice ends the menu's work, so it can close. */
  public readonly done = output();

  protected readonly kind = computed((): FieldKind => this.fields().find((f) => f.name === this.column())?.kind ?? "text");
  protected readonly order = computed(() => ORDER[this.kind()]);
  protected readonly title = computed(() => this.layout().titles[this.column()] ?? this.column());
  protected readonly sorted = computed(() => this.layout().sort.some((s) => s.column === this.column()));
  protected readonly pinned = computed(() => this.layout().pinned.includes(this.column()));
  protected readonly total = computed(() => totalOf(this.layout(), this.column()) ?? "");
  protected readonly totals = computed(() => totalChoices(this.kind()));

  protected name(aggregate: LayoutMeasure["aggregate"]): string {
    return label(aggregate);
  }

  protected sort(descending: boolean | null): void {
    this.finish(withSort(this.layout(), this.column(), descending));
  }

  protected hide(): Layout {
    return withHidden(this.layout(), this.column(), this.fields());
  }

  protected pin(): Layout {
    return withPinned(this.layout(), this.column(), !this.pinned());
  }

  protected rename(event: Event): void {
    const text = event.target instanceof HTMLInputElement ? event.target.value : "";
    this.changed.emit(withTitle(this.layout(), this.column(), text));
  }

  protected setTotal(event: Event): void {
    const value = event.target instanceof HTMLSelectElement ? event.target.value : "";
    const aggregate = this.totals().find((a) => a === value) ?? null;
    this.changed.emit(withTotal(this.layout(), this.column(), aggregate));
  }

  protected finish(next: Layout): void {
    this.changed.emit(next);
    this.done.emit();
  }
}
