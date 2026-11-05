/**
 * The field list's Filters area: a chip for each filtered column, which opens the same filter editor as a grid's
 * header menu. A field dropped here shows "(All)" with its value list open until something is picked: an empty filter
 * would keep no rows, so it stays out of the layout until it says what to keep.
 */

import { ChangeDetectionStrategy, Component, ElementRef, Injector, ViewEncapsulation, afterNextRender, computed, inject, input, output, signal } from "@angular/core";

import { ColumnFilterComponent } from "../filter/column-filter.component";
import { filterLabel, withColumnCondition } from "../grid/edit";
import type { SourceField } from "../grid/grid-source";
import type { Layout } from "../layout";
import { IconComponent } from "../ui/icon.component";
import { PopoverComponent } from "../ui/popover.component";
import { leftTarget } from "./drag";
import type { Dragged } from "./drag";
import type { ValueSource } from "./value-picker.component";

@Component({
  selector: "px-pivot-filter-well",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [ColumnFilterComponent, IconComponent, PopoverComponent],
  host: { class: "px-well" },
  template: `
    <h3>Filters</h3>
    <ol class="px-well-chips" aria-label="Filters" [attr.data-drop]="hovering()" [class.px-drop-end]="hovering()" (dragover)="over($event)" (dragleave)="leave($event)" (drop)="drop($event)">
      @for (chip of chips(); track chip.column) {
        <li class="px-chip">
          <button
            #edit
            type="button"
            class="px-chip-text"
            [attr.data-column]="chip.column"
            [attr.aria-expanded]="open()?.column === chip.column"
            [title]="chip.text"
            (click)="toggle(chip.column, edit)"
          >
            {{ chip.text }}
          </button>
          <button type="button" class="px-chip-button" [attr.aria-label]="'Remove the filter on ' + chip.title" (click)="remove(chip.column)"><px-icon name="close" /></button>
        </li>
      } @empty {
        <li class="px-well-empty">Drop fields here to filter by them</li>
      }
    </ol>
    @if (editing(); as e) {
      <px-popover [anchor]="e.anchor" (closed)="open.set(null)">
        <px-column-filter [layout]="layout()" [column]="e.column" [kind]="e.kind" [source]="source()" (changed)="changed.emit($event)" />
      </px-popover>
    }
  `
})
export class PivotFilterWellComponent {
  /** The pivot's layout. */
  public readonly layout = input.required<Layout>();
  /** The dataset's columns. */
  public readonly fields = input.required<readonly SourceField[]>();
  /** Where a column's values come from, for its list. */
  public readonly source = input.required<ValueSource>();
  /** What the panel is dragging, if anything; only that can be dropped here. */
  public readonly dragging = input<Dragged | null>(null);
  /** Fires with each edited layout. */
  public readonly changed = output<Layout>();
  /** Fires when something is dropped here. */
  public readonly dropped = output();

  /** Columns added here, kept as chips while they filter nothing yet. */
  private readonly added = signal<readonly string[]>([]);
  /** The column whose editor is open, and the chip it hangs from. */
  protected readonly open = signal<{ readonly column: string; readonly anchor: HTMLElement } | null>(null);
  private readonly hovered = signal(false);
  protected readonly hovering = computed(() => this.dragging() !== null && this.hovered());
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly chips = computed(() => {
    const layout = this.layout();
    const title = (c: string): string => layout.titles[c] ?? c;
    const own = layout.filters.filter((f) => f.columns.length === 0);
    const columns = [...new Set([...own.map((f) => f.column), ...this.added()])];
    return columns.map((column) => {
      const filters = own.filter((f) => f.column === column);
      const text = filters.length === 0 ? `${title(column)}: (All)` : filters.map((f) => filterLabel(f, title)).join(" and ");
      return { column, title: title(column), text };
    });
  });

  /** The open editor's column, its kind, and the chip it hangs from. */
  protected readonly editing = computed(() => {
    const open = this.open();
    return open === null ? null : { ...open, kind: this.fields().find((f) => f.name === open.column)?.kind ?? "text" };
  });

  /** Adds a chip for `column`, if it has none, and opens its editor from it. */
  public add(column: string): void {
    if (this.openFrom(column)) {
      return;
    }
    this.added.set([...this.added(), column]);
    // The new chip is drawn on the next render, and the editor hangs from it.
    afterNextRender(
      () => {
        this.openFrom(column);
      },
      { injector: this.injector }
    );
  }

  /** Opens `column`'s editor from its chip, if the chip is drawn; returns whether it was. */
  private openFrom(column: string): boolean {
    const anchor = [...this.host.querySelectorAll<HTMLElement>(".px-chip-text")].find((b) => b.dataset["column"] === column);
    if (anchor !== undefined) {
      this.open.set({ column, anchor });
    }
    return anchor !== undefined;
  }

  protected toggle(column: string, anchor: HTMLElement): void {
    this.open.set(this.open()?.column === column ? null : { column, anchor });
  }

  protected remove(column: string): void {
    this.added.set(this.added().filter((c) => c !== column));
    if (this.open()?.column === column) {
      this.open.set(null);
    }
    this.changed.emit(withColumnCondition(this.layout(), column, { kind: "none" }));
  }

  protected over(event: DragEvent): void {
    if (this.dragging() !== null) {
      // Accepting the drag is what lets it drop here.
      event.preventDefault();
      this.hovered.set(true);
    }
  }

  protected leave(event: DragEvent): void {
    if (leftTarget(event)) {
      this.hovered.set(false);
    }
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    this.hovered.set(false);
    if (this.dragging() !== null) {
      this.dropped.emit();
    }
  }
}
