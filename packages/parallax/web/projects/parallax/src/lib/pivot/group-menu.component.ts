/** A row or column group's menu in the field list: move it, move it to another area, filter by it, or remove it. */

import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core";

import type { SourceField } from "../grid/grid-source";
import type { Layout } from "../layout";
import { MenuComponent } from "../ui/menu.component";
import { chipColumn, moveChip, removeChip } from "./edit";
import type { ChipArea } from "./edit";

@Component({
  selector: "px-group-menu",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MenuComponent],
  host: { "[attr.aria-label]": "'Field ' + (column() ?? '')" },
  template: `
    <px-menu>
      <button type="button" role="menuitem" [disabled]="index() === 0" (click)="finish(moved(index() - 1))">Move up</button>
      <button type="button" role="menuitem" [disabled]="last()" (click)="finish(moved(index() + 2))">Move down</button>
      <hr />
      <button type="button" role="menuitem" (click)="finish(movedTo(other()))">{{ other() === "rows" ? "Move to Rows" : "Move to Columns" }}</button>
      <button type="button" role="menuitem" (click)="finish(movedTo('values'))">Move to Values</button>
      <button type="button" role="menuitem" (click)="filterBy.emit(column() ?? ''); done.emit()">Filter by this field</button>
      <hr />
      <button type="button" role="menuitem" (click)="finish(removed())">Remove field</button>
    </px-menu>
  `
})
export class GroupMenuComponent {
  /** The pivot's layout. */
  public readonly layout = input.required<Layout>();
  /** Rows or columns. */
  public readonly area = input.required<Exclude<ChipArea, "values">>();
  /** The chip's position in its area. */
  public readonly index = input.required<number>();
  /** The dataset's columns. */
  public readonly fields = input.required<readonly SourceField[]>();
  /** Fires with each edited layout. */
  public readonly changed = output<Layout>();
  /** Asks for a filter on the chip's column. */
  public readonly filterBy = output<string>();
  /** Fires when a choice ends the menu's work, so it can close. */
  public readonly done = output();

  protected readonly column = computed(() => chipColumn(this.layout(), { area: this.area(), index: this.index() }));
  protected readonly other = computed((): Exclude<ChipArea, "values"> => (this.area() === "rows" ? "columns" : "rows"));
  protected readonly last = computed(() => this.index() >= (this.area() === "rows" ? this.layout().group_by : this.layout().split_by).length - 1);

  /** Moves the chip before position `at` of its own area. */
  protected moved(at: number): Layout {
    return moveChip(this.layout(), { area: this.area(), index: this.index() }, this.area(), at, this.fields());
  }

  protected movedTo(area: ChipArea): Layout {
    return moveChip(this.layout(), { area: this.area(), index: this.index() }, area, null, this.fields());
  }

  protected removed(): Layout {
    return removeChip(this.layout(), { area: this.area(), index: this.index() });
  }

  protected finish(next: Layout): void {
    this.changed.emit(next);
    this.done.emit();
  }
}
