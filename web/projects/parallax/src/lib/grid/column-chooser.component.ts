/**
 * Which columns a grid shows, and in what order: a box per column, ticked when shown, with a search to find one. Shown
 * columns are dragged to reorder, or moved with Alt+Up and Alt+Down, and each can be pinned at the left.
 */

import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input, output, signal } from "@angular/core";

import type { Layout } from "../layout";
import { IconComponent } from "../ui/icon.component";
import { shownColumns, withColumnBefore, withPinned, withShown } from "./edit";
import type { SourceField } from "./grid-source";

/** One line of the chooser. */
interface Item {
  readonly name: string;
  readonly title: string;
  readonly shown: boolean;
  readonly pinned: boolean;
}

@Component({
  selector: "px-column-chooser",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [IconComponent],
  host: { class: "px-column-chooser" },
  styles: `
    .px-column-chooser {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 280px;
      padding: 4px;
    }
    .px-column-chooser input[type="search"] {
      height: 28px;
      padding: 0 8px;
      border: 1px solid var(--px-control-border);
      border-radius: calc(var(--px-radius) - 2px);
      background: var(--px-control-bg);
      color: var(--px-control-fg);
      font: inherit;
    }
    .px-column-chooser ul {
      max-height: 320px;
      overflow: auto;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .px-column-chooser li {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 4px;
      border-radius: calc(var(--px-radius) - 2px);
    }
    .px-column-chooser li:hover {
      background: var(--px-control-hover);
    }
    .px-column-chooser li[data-drop="true"] {
      box-shadow: inset 0 2px 0 var(--px-accent);
    }
    .px-column-chooser li > px-icon {
      color: var(--px-muted-fg);
      cursor: grab;
    }
    .px-column-chooser label {
      display: flex;
      flex: 1;
      gap: 6px;
      align-items: center;
      min-width: 0;
    }
    .px-column-chooser label span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .px-column-chooser .px-pin {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--px-muted-fg);
      cursor: pointer;
    }
    .px-column-chooser .px-pin[aria-pressed="true"] {
      color: var(--px-accent);
    }
    .px-column-chooser .px-muted {
      margin: 0;
      color: var(--px-muted-fg);
      font-size: 12px;
    }
  `,
  template: `
    <input type="search" placeholder="Find a column" aria-label="Find a column" [value]="search()" (input)="onSearch($event)" />
    <ul aria-label="Columns">
      @for (item of items(); track item.name) {
        <li
          tabindex="-1"
          [attr.draggable]="item.shown"
          [attr.data-drop]="dropOn() === item.name"
          (dragstart)="dragging = item.name"
          (dragover)="over($event, item)"
          (dragleave)="dropOn.set(null)"
          (drop)="drop($event, item.name)"
          (keydown.alt.arrowup)="step($event, item.name, -1)"
          (keydown.alt.arrowdown)="step($event, item.name, 1)"
        >
          <px-icon name="drag" />
          <label>
            <input
              type="checkbox"
              [checked]="item.shown"
              (change)="changed.emit(withShown(layout(), fields(), item.name, !item.shown))"
              (keydown.alt.arrowup)="step($event, item.name, -1)"
              (keydown.alt.arrowdown)="step($event, item.name, 1)"
            />
            <span>{{ item.title }}</span>
          </label>
          <button
            type="button"
            class="px-pin"
            [attr.aria-pressed]="item.pinned"
            [attr.aria-label]="(item.pinned ? 'Unpin ' : 'Pin ') + item.title"
            (click)="changed.emit(withPinned(layout(), item.name, !item.pinned))"
          >
            <px-icon name="pin" />
          </button>
        </li>
      }
    </ul>
    <p class="px-muted">Drag to reorder, or press Alt+↑ and Alt+↓.</p>
  `
})
export class ColumnChooserComponent {
  /** The grid's layout. */
  public readonly layout = input.required<Layout>();
  /** The dataset's columns. */
  public readonly fields = input.required<readonly SourceField[]>();
  /** Fires with each edited layout. */
  public readonly changed = output<Layout>();

  protected readonly withShown = withShown;
  protected readonly withPinned = withPinned;
  protected readonly search = signal("");
  protected readonly dropOn = signal<string | null>(null);
  /** The column being dragged. */
  protected dragging: string | null = null;

  /** Shown columns in their order, then the hidden ones, as far as the search lets through. */
  protected readonly items = computed((): readonly Item[] => {
    const layout = this.layout();
    const shown = shownColumns(layout, this.fields());
    const hidden = this.fields()
      .map((f) => f.name)
      .filter((c) => !shown.includes(c));
    const needle = this.search().trim().toLowerCase();
    return [...shown, ...hidden]
      .map((name) => ({ name, title: layout.titles[name] ?? name, shown: shown.includes(name), pinned: layout.pinned.includes(name) }))
      .filter((item) => needle === "" || item.title.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle));
  });

  protected onSearch(event: Event): void {
    this.search.set(event.target instanceof HTMLInputElement ? event.target.value : "");
  }

  protected over(event: DragEvent, item: Item): void {
    if (this.dragging !== null && item.shown) {
      event.preventDefault();
      this.dropOn.set(item.name);
    }
  }

  protected drop(event: DragEvent, before: string): void {
    event.preventDefault();
    const moved = this.dragging;
    this.dragging = null;
    this.dropOn.set(null);
    if (moved !== null && moved !== before) {
      this.changed.emit(withColumnBefore(this.layout(), this.fields(), moved, before));
    }
  }

  /** Moves a shown column one place up or down. */
  protected step(event: Event, column: string, delta: -1 | 1): void {
    event.preventDefault();
    const shown = shownColumns(this.layout(), this.fields());
    const at = shown.indexOf(column);
    if (at === -1) {
      return;
    }
    const before = delta < 0 ? (shown[at - 1] ?? null) : (shown[at + 2] ?? null);
    if (delta < 0 && at === 0) {
      return;
    }
    this.changed.emit(withColumnBefore(this.layout(), this.fields(), column, before));
  }
}
