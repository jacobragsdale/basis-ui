/** The menu a data column's header opens: a list column's own, or, in a pivot, its measure's. */

import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core";

import type { Layout } from "../layout";
import { MeasureMenuComponent } from "../pivot/measure-menu.component";
import type { ValueSource } from "../pivot/value-picker.component";
import type { SourceField } from "./grid-source";
import { HeaderMenuComponent } from "./header-menu.component";

@Component({
  selector: "px-column-menu",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HeaderMenuComponent, MeasureMenuComponent],
  template: `
    @if (measure() === null) {
      <px-header-menu [layout]="layout()" [column]="column()" [fields]="fields()" [source]="source()" (changed)="changed.emit($event)" (fit)="fit.emit()" (done)="done.emit()" />
    } @else {
      <px-measure-menu [layout]="layout()" [index]="index()" [fields]="fields()" [sorting]="true" (changed)="changed.emit($event)" (done)="done.emit()" />
    }
  `
})
export class ColumnMenuComponent {
  /** The grid's layout. */
  public readonly layout = input.required<Layout>();
  /** The source column a list's header edits. */
  public readonly column = input.required<string>();
  /** The measure a pivot's header edits, or null for a list's column. */
  public readonly measure = input.required<number | null>();
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

  protected readonly index = computed(() => this.measure() ?? 0);
}
