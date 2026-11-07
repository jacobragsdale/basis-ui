/**
 * The dataset's fields, as Excel's PivotTable field list shows them: searchable, ticked when the pivot uses them, and
 * dragged into an area. Ticking adds a field where Excel does, numbers to Values and anything else to Rows; unticking
 * takes it out of every area. Each field's menu adds it to any area, so dragging is never required.
 */

import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input, output, signal } from "@angular/core";

import type { SourceField } from "../grid/grid-source";
import type { Layout } from "../layout";
import { IconComponent } from "../ui/icon.component";
import { MenuComponent } from "../ui/menu.component";
import { PopoverComponent } from "../ui/popover.component";
import { beginDrag } from "./drag";
import type { Dragged } from "./drag";
import { areasOf, placeField, withField, withoutField } from "./edit";
import type { Area, ChipArea } from "./edit";

const AREA_NAMES: Readonly<Record<Area, string>> = { rows: "Rows", columns: "Columns", values: "Values", filters: "Filters" };

@Component({
  selector: "px-pivot-field-list",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [IconComponent, MenuComponent, PopoverComponent],
  host: { class: "px-field-list" },
  template: `
    <input type="search" class="px-field-search" placeholder="Find a field" aria-label="Find a field" [value]="search()" (input)="onSearch($event)" />
    <ul aria-label="Fields">
      @for (field of shown(); track field.name) {
        <li class="px-field" draggable="true" (dragstart)="start($event, field.name)" (dragend)="dragEnd.emit()">
          <label>
            <input type="checkbox" [checked]="field.used" (change)="tick(field.name, $event)" />
            <span>{{ field.name }}</span>
          </label>
          <span class="px-field-areas">{{ field.areas }}</span>
          <button #addButton type="button" class="px-chip-button" [attr.aria-label]="'Add ' + field.name + ' to'" (click)="toggle(field.name, addButton)"><px-icon name="chevron-down" /></button>
        </li>
      } @empty {
        <li class="px-muted">No field matches</li>
      }
    </ul>
    @if (menu(); as m) {
      <px-popover [anchor]="m.anchor" (closed)="menu.set(null)">
        <px-menu [attr.aria-label]="'Add ' + m.column">
          <button type="button" role="menuitem" (click)="addTo(m.column, 'rows')">Add to Rows</button>
          <button type="button" role="menuitem" (click)="addTo(m.column, 'columns')">Add to Columns</button>
          <button type="button" role="menuitem" (click)="addTo(m.column, 'values')">Add to Values</button>
          <button type="button" role="menuitem" (click)="filterBy.emit(m.column); menu.set(null)">Add to Filters</button>
        </px-menu>
      </px-popover>
    }
  `
})
export class PivotFieldListComponent {
  /** The pivot's layout. */
  public readonly layout = input.required<Layout>();
  /** The dataset's columns. */
  public readonly fields = input.required<readonly SourceField[]>();
  /** Fires with each edited layout. */
  public readonly changed = output<Layout>();
  /** Fires when a field starts being dragged. */
  public readonly dragStart = output<Dragged>();
  /** Fires when a drag that started here ends, dropped or not. */
  public readonly dragEnd = output();
  /** Asks for a filter on a field. */
  public readonly filterBy = output<string>();

  protected readonly search = signal("");
  /** The field whose menu is open, and the button it opened from. */
  protected readonly menu = signal<{ readonly column: string; readonly anchor: HTMLElement } | null>(null);
  protected readonly shown = computed(() => {
    const layout = this.layout();
    const search = this.search().trim().toLowerCase();
    return this.fields()
      .filter((f) => search === "" || f.name.toLowerCase().includes(search))
      .map((f) => {
        const areas = areasOf(layout, f.name);
        return { name: f.name, used: areas.length > 0, areas: areas.map((a) => AREA_NAMES[a]).join(", ") };
      });
  });

  protected onSearch(event: Event): void {
    this.search.set(event.target instanceof HTMLInputElement ? event.target.value : "");
  }

  protected toggle(column: string, anchor: HTMLElement): void {
    this.menu.set(this.menu()?.column === column ? null : { column, anchor });
  }

  protected tick(column: string, event: Event): void {
    const field = this.fields().find((f) => f.name === column);
    const on = event.target instanceof HTMLInputElement && event.target.checked;
    if (field !== undefined) {
      this.changed.emit(on ? withField(this.layout(), field) : withoutField(this.layout(), column));
    }
  }

  protected addTo(column: string, area: ChipArea): void {
    const field = this.fields().find((f) => f.name === column);
    this.menu.set(null);
    if (field !== undefined) {
      this.changed.emit(placeField(this.layout(), field, area));
    }
  }

  protected start(event: DragEvent, column: string): void {
    this.menu.set(null);
    beginDrag(event, column);
    this.dragStart.emit({ kind: "field", column });
  }
}
