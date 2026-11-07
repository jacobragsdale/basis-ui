/**
 * One area of the field list, Rows, Columns or Values: its chips in order, each dragged to move it, with a menu and a
 * remove button so dragging is never required. A drag over the area shows where it would land.
 */

import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input, output, signal } from "@angular/core";

import type { SourceField } from "../grid/grid-source";
import type { Layout } from "../layout";
import { IconComponent } from "../ui/icon.component";
import { PopoverComponent } from "../ui/popover.component";
import { beginDrag, dropIndex, leftTarget } from "./drag";
import type { Dragged } from "./drag";
import { removeChip } from "./edit";
import type { ChipArea } from "./edit";
import { GroupMenuComponent } from "./group-menu.component";
import { measureName } from "./labels";
import { MeasureMenuComponent } from "./measure-menu.component";

/** What each area says when it is empty. */
const EMPTY: Readonly<Record<ChipArea, string>> = { rows: "Drop fields here to group rows", columns: "Drop fields here to group columns", values: "Drop fields here to total them" };

@Component({
  selector: "px-pivot-well",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [GroupMenuComponent, IconComponent, MeasureMenuComponent, PopoverComponent],
  host: { class: "px-well" },
  template: `
    <h3>{{ title() }}</h3>
    <ol
      class="px-well-chips"
      [attr.aria-label]="title()"
      [attr.data-drop]="dropAt() !== null"
      [class.px-drop-end]="dropAt() === chips().length"
      (dragover)="over($event)"
      (dragleave)="leave($event)"
      (drop)="drop($event)"
    >
      @for (chip of chips(); track chip.key) {
        <li class="px-chip" draggable="true" [class.px-drop-before]="dropAt() === $index" (dragstart)="start($event, $index, chip.text)" (dragend)="dragEnd.emit()">
          <px-icon name="drag" />
          <span [title]="chip.text">{{ chip.text }}</span>
          <button #menuButton type="button" class="px-chip-button" [attr.aria-label]="'Options for ' + chip.text" [attr.aria-expanded]="open()?.index === $index" (click)="toggle($index, menuButton)">
            <px-icon name="chevron-down" />
          </button>
          <button type="button" class="px-chip-button" [attr.aria-label]="'Remove ' + chip.text" (click)="changed.emit(removed($index))"><px-icon name="close" /></button>
        </li>
      } @empty {
        <li class="px-well-empty">{{ empty() }}</li>
      }
    </ol>
    @if (open(); as o) {
      <px-popover [anchor]="o.anchor" (closed)="open.set(null)">
        @if (area() === "values") {
          <px-measure-menu [layout]="layout()" [index]="o.index" [fields]="fields()" (changed)="changed.emit($event)" (done)="open.set(null)" />
        } @else {
          <px-group-menu [layout]="layout()" [area]="axis()" [index]="o.index" [fields]="fields()" (changed)="changed.emit($event)" (filterBy)="filterBy.emit($event)" (done)="open.set(null)" />
        }
      </px-popover>
    }
  `
})
export class PivotWellComponent {
  /** Which area this is. */
  public readonly area = input.required<ChipArea>();
  /** The heading. */
  public readonly title = input.required<string>();
  /** The pivot's layout. */
  public readonly layout = input.required<Layout>();
  /** The dataset's columns. */
  public readonly fields = input.required<readonly SourceField[]>();
  /** What the panel is dragging, if anything; only that can be dropped here. */
  public readonly dragging = input<Dragged | null>(null);
  /** Fires with each edited layout. */
  public readonly changed = output<Layout>();
  /** Fires when one of this area's chips starts being dragged. */
  public readonly dragStart = output<Dragged>();
  /** Fires when a drag that started here ends, dropped or not. */
  public readonly dragEnd = output();
  /** Fires when something is dropped here, with the chip it goes before, or null for the end. */
  public readonly dropped = output<number | null>();
  /** Asks for a filter on a chip's column. */
  public readonly filterBy = output<string>();

  /** The chip whose menu is open, and the button it opened from. */
  protected readonly open = signal<{ readonly index: number; readonly anchor: HTMLElement } | null>(null);
  private readonly hovered = signal<number | null>(null);
  /** Where a drop would land, while the panel drags something. */
  protected readonly dropAt = computed(() => (this.dragging() === null ? null : this.hovered()));
  protected readonly empty = computed(() => EMPTY[this.area()]);
  protected readonly axis = computed((): Exclude<ChipArea, "values"> => (this.area() === "columns" ? "columns" : "rows"));
  protected readonly chips = computed(() => {
    const layout = this.layout();
    if (this.area() === "values") {
      return layout.measures.map((m, i) => ({ key: `${String(i)}:${measureName(m)}`, text: measureName(m) }));
    }
    const columns = this.area() === "rows" ? layout.group_by : layout.split_by;
    return columns.map((c) => ({ key: c, text: layout.titles[c] ?? c }));
  });

  protected toggle(index: number, anchor: HTMLElement): void {
    this.open.set(this.open()?.index === index ? null : { index, anchor });
  }

  protected removed(index: number): Layout {
    return removeChip(this.layout(), { area: this.area(), index });
  }

  protected start(event: DragEvent, index: number, text: string): void {
    this.open.set(null);
    beginDrag(event, text);
    this.dragStart.emit({ kind: "chip", chip: { area: this.area(), index } });
  }

  protected over(event: DragEvent): void {
    const list = event.currentTarget;
    if (this.dragging() === null || !(list instanceof Element)) {
      return;
    }
    // Accepting the drag is what lets it drop here.
    event.preventDefault();
    this.hovered.set(dropIndex(list, event.clientY));
  }

  protected leave(event: DragEvent): void {
    if (leftTarget(event)) {
      this.hovered.set(null);
    }
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    const at = this.hovered();
    this.hovered.set(null);
    if (this.dragging() !== null) {
      this.dropped.emit(at === null || at >= this.chips().length ? null : at);
    }
  }
}
