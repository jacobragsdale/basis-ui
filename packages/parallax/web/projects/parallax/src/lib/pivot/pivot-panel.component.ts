/**
 * The pivot's settings, as Excel's PivotTable field list lays them out: the searchable fields, then the Filters,
 * Columns, Rows and Values areas they are dragged into, then the options. The panel keeps what is being dragged and
 * turns each drop into a layout.
 */

import { ChangeDetectionStrategy, Component, input, output, signal, viewChild } from "@angular/core";

import type { SourceField } from "../grid/grid-source";
import type { Layout } from "../layout";
import type { Dragged } from "./drag";
import { chipColumn, moveChip, placeField, removeChip } from "./edit";
import type { ChipArea } from "./edit";
import { PivotFieldListComponent } from "./field-list.component";
import { PivotFilterWellComponent } from "./filter-well.component";
import { PivotOptionsComponent } from "./options.component";
import type { ValueSource } from "./value-picker.component";
import { PivotWellComponent } from "./well.component";

@Component({
  selector: "px-pivot-panel",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PivotFieldListComponent, PivotFilterWellComponent, PivotOptionsComponent, PivotWellComponent],
  template: `
    <px-pivot-field-list [layout]="layout()" [fields]="fields()" (changed)="changed.emit($event)" (dragStart)="dragging.set($event)" (dragEnd)="dragging.set(null)" (filterBy)="filterBy($event)" />
    <p class="px-muted px-pivot-hint">Drag fields between the areas below, or use their menus.</p>
    <px-pivot-filter-well [layout]="layout()" [fields]="fields()" [source]="source()" [dragging]="dragging()" (changed)="changed.emit($event)" (dropped)="dropOnFilters()" />
    @for (well of wells; track well.area) {
      <px-pivot-well
        [area]="well.area"
        [title]="well.title"
        [layout]="layout()"
        [fields]="fields()"
        [dragging]="dragging()"
        (changed)="changed.emit($event)"
        (dragStart)="dragging.set($event)"
        (dragEnd)="dragging.set(null)"
        (dropped)="drop(well.area, $event)"
        (filterBy)="filterBy($event)"
      />
    }
    <section aria-label="Options">
      <h3>Options</h3>
      <px-pivot-options [layout]="layout()" (changed)="changed.emit($event)" />
    </section>
  `
})
export class PivotPanelComponent {
  /** The layout being edited. */
  public readonly layout = input.required<Layout>();
  /** The dataset's columns. */
  public readonly fields = input.required<readonly SourceField[]>();
  /** Where filter pick-list values come from. */
  public readonly source = input.required<ValueSource>();
  /** Fires with each edited layout. */
  public readonly changed = output<Layout>();

  protected readonly wells: readonly { readonly area: ChipArea; readonly title: string }[] = [
    { area: "columns", title: "Columns" },
    { area: "rows", title: "Rows" },
    { area: "values", title: "Values" }
  ];
  /** The field or chip being dragged. */
  protected readonly dragging = signal<Dragged | null>(null);
  private readonly filters = viewChild.required(PivotFilterWellComponent);

  /** Puts what was dragged in an area, before chip `at` or at the end. */
  protected drop(area: ChipArea, at: number | null): void {
    const dragged = this.dragging();
    this.dragging.set(null);
    const layout = this.layout();
    if (dragged?.kind === "chip") {
      this.changed.emit(moveChip(layout, dragged.chip, area, at, this.fields()));
      return;
    }
    const field = this.fields().find((f) => f.name === dragged?.column);
    if (field !== undefined) {
      this.changed.emit(placeField(layout, field, area, at));
    }
  }

  /** Filters by what was dropped on Filters; a chip moves there, as in Excel. */
  protected dropOnFilters(): void {
    const dragged = this.dragging();
    this.dragging.set(null);
    if (dragged?.kind === "field") {
      this.filterBy(dragged.column);
      return;
    }
    const column = dragged === null ? null : chipColumn(this.layout(), dragged.chip);
    if (dragged !== null && column !== null) {
      this.changed.emit(removeChip(this.layout(), dragged.chip));
      this.filterBy(column);
    }
  }

  protected filterBy(column: string): void {
    this.filters().add(column);
  }
}
