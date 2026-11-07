/** The toolbar's Columns, which opens the column chooser, and Totals, which turns the totals row on and off. */

import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input, output, signal } from "@angular/core";

import type { Layout } from "../layout";
import { IconComponent } from "../ui/icon.component";
import { PopoverComponent } from "../ui/popover.component";
import { ColumnChooserComponent } from "./column-chooser.component";
import { defaultTotals } from "./edit";
import type { SourceField } from "./grid-source";

@Component({
  selector: "px-column-tools",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [ColumnChooserComponent, IconComponent, PopoverComponent],
  host: { class: "px-column-tools" },
  template: `
    @if (columns()) {
      <button #chooser type="button" aria-haspopup="dialog" [attr.aria-expanded]="open()" aria-label="Columns" (click)="open.set(!open())">
        <px-icon name="columns" /><span class="px-label">Columns</span>
      </button>
      @if (open()) {
        <px-popover [anchor]="chooser" alignTo="end" (closed)="open.set(false)">
          <px-column-chooser [layout]="layout()" [fields]="fields()" (changed)="changed.emit($event)" />
        </px-popover>
      }
    }
    @if (totals()) {
      <button type="button" [attr.aria-pressed]="totalled()" title="A totals row under the rows; each column's total is in its menu" aria-label="Totals" (click)="toggleTotals()">
        <px-icon name="sum" /><span class="px-label">Totals</span>
      </button>
    }
  `
})
export class ColumnToolsComponent {
  /** The grid's layout. */
  public readonly layout = input.required<Layout>();
  /** The dataset's columns. */
  public readonly fields = input.required<readonly SourceField[]>();
  /** Whether Columns shows. */
  public readonly columns = input(true);
  /** Whether Totals shows. */
  public readonly totals = input(true);
  /** Fires with each edited layout. */
  public readonly changed = output<Layout>();

  protected readonly open = signal(false);
  protected readonly totalled = computed(() => this.layout().totals.length > 0);

  protected toggleTotals(): void {
    const layout = this.layout();
    this.changed.emit(this.totalled() ? { ...layout, totals: [] } : defaultTotals(layout, this.fields()));
  }
}
