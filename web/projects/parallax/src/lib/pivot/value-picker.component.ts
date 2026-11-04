/**
 * Picks filter values from the column's own values, searched on the engine with
 * the view's other filters applied, as a spreadsheet's filter list does. Values
 * travel as exact JSON, so a decimal or a large integer matches what was picked.
 */

import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from "@angular/core";

import type { DistinctValues } from "../connection";
import { pathValue } from "../format";
import type { LayoutScalar } from "../layout";

/** Lists a column's values for a search. */
export type ValueSource = (column: string, search: string, limit: number) => Promise<DistinctValues>;

/** How many values one search shows. */
const LIMIT = 200;

interface Option {
  readonly key: string;
  readonly value: LayoutScalar;
  readonly text: string;
  readonly rows: string;
}

@Component({
  selector: "px-value-picker",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (searchable()) {
      <input type="search" aria-label="Search values" placeholder="Search…" [value]="search()" (input)="onSearch($event)" />
    }
    <ul role="listbox" aria-multiselectable="true">
      @for (option of options(); track option.key) {
        <li>
          <label>
            <input type="checkbox" [checked]="chosen().has(option.key)" (change)="toggle(option)" />
            <span>{{ option.text === "" ? "(blank)" : option.text }}</span>
            <span class="px-muted">{{ option.rows }}</span>
          </label>
        </li>
      } @empty {
        <li class="px-muted">{{ note() }}</li>
      }
    </ul>
    @if (truncated()) {
      <p class="px-muted">Showing the first {{ limit }}. Search to narrow them.</p>
    }
  `
})
export class ValuePickerComponent {
  /** The column. */
  public readonly column = input.required<string>();
  /** Where values come from. */
  public readonly source = input.required<ValueSource>();
  /** The values already chosen. */
  public readonly values = input.required<readonly LayoutScalar[]>();
  /** Whether the list can be searched: the engine searches text columns only. */
  public readonly searchable = input(true);
  /** Fires with the chosen values. */
  public readonly changed = output<readonly LayoutScalar[]>();

  protected readonly limit = LIMIT;
  protected readonly search = signal("");
  protected readonly options = signal<readonly Option[]>([]);
  protected readonly truncated = signal(false);
  protected readonly note = signal("Loading…");
  protected readonly chosen = computed((): ReadonlySet<string> => new Set(this.values().map((v) => JSON.stringify(v))));
  /** Counts the lists asked for, so that only the answer to the newest is shown. */
  private generation = 0;
  /** Whether a list is on its way. */
  private loading = false;
  /** The newest list asked for while another was on its way, asked for when that one arrives. */
  private queued: { readonly column: string; readonly search: string } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.generation += 1;
      this.queued = null;
    });
    // A new column starts a new list, unsearched.
    effect(() => {
      const column = this.column();
      untracked(() => {
        this.search.set("");
        this.options.set([]);
        this.load(column, "");
      });
    });
  }

  protected onSearch(event: Event): void {
    const text = event.target instanceof HTMLInputElement ? event.target.value : "";
    this.search.set(text);
    this.load(this.column(), text);
  }

  protected toggle(option: Option): void {
    const next = new Set(this.chosen());
    if (next.has(option.key)) {
      next.delete(option.key);
    } else {
      next.add(option.key);
    }
    const known = new Map([...this.values().map((v): [string, LayoutScalar] => [JSON.stringify(v), v]), ...this.options().map((o): [string, LayoutScalar] => [o.key, o.value])]);
    this.changed.emit([...next].flatMap((key) => (known.has(key) ? [known.get(key) ?? null] : [])));
  }

  /**
   * Asks for a column's values. One list is asked for at a time: while one is on its way, the newest search waits
   * for it, so typing searches on every keystroke without a backlog on a large table.
   */
  private load(column: string, search: string): void {
    this.generation += 1;
    this.note.set("Loading…");
    if (this.loading) {
      this.queued = { column, search };
      return;
    }
    this.fetch(column, search);
  }

  private fetch(column: string, search: string): void {
    const mine = this.generation;
    this.loading = true;
    const settle = (): void => {
      this.loading = false;
      const next = this.queued;
      this.queued = null;
      if (next !== null) {
        this.fetch(next.column, next.search);
      }
    };
    this.source()(column, search, LIMIT).then(
      (result) => {
        settle();
        if (mine !== this.generation) {
          return;
        }
        this.options.set(
          result.values.map((v) => {
            const value = pathValue(v.value);
            return { key: JSON.stringify(value), value, text: v.text, rows: v.rows.toLocaleString("en-US") };
          })
        );
        this.truncated.set(result.truncated);
        this.note.set("No values match.");
      },
      (failure: unknown) => {
        settle();
        if (mine === this.generation) {
          this.note.set(failure instanceof Error ? failure.message : String(failure));
        }
      }
    );
  }
}
