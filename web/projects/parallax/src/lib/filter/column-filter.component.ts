/**
 * The filter editor of one column, as Excel's filter menu has it: keep the values ticked in a searchable list with
 * their counts, or a condition. Text takes contains, does not contain, starts with, ends with, equals and blank;
 * numbers and dates take comparisons, between and blank. "Does not contain" keeps blanks, as in Excel, and says so.
 * Grids and pivots share it.
 */

import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, effect, input, output, signal, untracked } from "@angular/core";

import { columnCondition, withColumnCondition } from "../grid/edit";
import type { ColumnCondition } from "../grid/edit";
import type { FieldKind } from "../grid/grid-source";
import type { Layout, LayoutFilter, LayoutScalar } from "../layout";
import { filterValue } from "../pivot/edit";
import { ValuePickerComponent } from "../pivot/value-picker.component";
import type { ValueSource } from "../pivot/value-picker.component";

/** What the editor can keep rows by. */
type Mode = "values" | "between" | LayoutFilter["op"];

/** The conditions a kind of column takes, after the list of values. */
function modesOf(kind: FieldKind): readonly Mode[] {
  switch (kind) {
    case "text":
      return ["values", "contains", "not_contains", "starts_with", "ends_with", "eq", "is_null", "is_not_null"];
    case "boolean":
      return ["values", "eq", "is_null", "is_not_null"];
    case "integer":
    case "float":
    case "decimal":
    case "date":
    case "timestamp":
      return ["values", "eq", "ne", "lt", "le", "gt", "ge", "between", "is_null", "is_not_null"];
  }
}

const MODE_TEXT: Readonly<Record<Mode, string>> = {
  values: "Values",
  between: "Between",
  contains: "Contains",
  not_contains: "Does not contain",
  starts_with: "Starts with",
  ends_with: "Ends with",
  eq: "Equals",
  ne: "Does not equal",
  lt: "Less than",
  le: "At most",
  gt: "Greater than",
  ge: "At least",
  is_null: "Is blank",
  is_not_null: "Is not blank",
  in: "Is one of",
  not_in: "Is none of"
};

/** The mode a condition shows in. */
function modeOf(condition: ColumnCondition): Mode {
  switch (condition.kind) {
    case "none":
    case "values":
      return "values";
    case "between":
      return "between";
    case "one":
      return condition.op;
  }
}

/** A value as an input holds it. */
function inputText(value: LayoutScalar | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

@Component({
  selector: "px-column-filter",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [ValuePickerComponent],
  host: { class: "px-column-filter" },
  styles: `
    .px-column-filter {
      display: flex;
      flex-direction: column;
      gap: calc(var(--_px-spacing) * 1.5);
      padding: var(--_px-spacing) calc(var(--_px-spacing) * 1.5);
    }
    .px-column-filter select,
    .px-column-filter input:not([type="checkbox"]) {
      height: var(--_px-control-height);
      padding: 0 calc(var(--_px-spacing) * 1.5);
      border: 1px solid var(--_px-control-border);
      border-radius: calc(var(--_px-radius) - 2px);
      background: var(--_px-control-background);
      color: var(--_px-control-foreground);
      font: inherit;
    }
    .px-column-filter .px-row {
      display: flex;
      gap: calc(var(--_px-spacing) * 1.5);
    }
    .px-column-filter .px-row > input {
      flex: 1;
      min-width: 0;
    }
    .px-column-filter .px-muted {
      margin: 0;
      color: var(--_px-muted);
      font-size: var(--_px-font-size-small);
    }
    .px-column-filter px-value-picker ul {
      max-height: 220px;
      overflow: auto;
      margin: var(--_px-spacing) 0 0;
      padding: 0;
      list-style: none;
    }
    .px-column-filter px-value-picker label {
      display: flex;
      gap: calc(var(--_px-spacing) * 1.5);
      align-items: center;
      padding: calc(var(--_px-spacing) * 0.5) 0;
    }
    .px-column-filter px-value-picker label > span:first-of-type {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .px-column-filter .px-link {
      align-self: flex-start;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--_px-accent);
      font: inherit;
      cursor: pointer;
    }
  `,
  template: `
    <select aria-label="Keep rows where" [value]="mode()" (change)="onMode($event)">
      @for (m of modes(); track m) {
        <option [value]="m">{{ text(m) }}</option>
      }
    </select>
    @if (mode() === "values") {
      <px-value-picker [column]="column()" [source]="source()" [values]="checked()" [searchable]="kind() === 'text'" (changed)="apply({ kind: 'values', values: $event })" />
    } @else if (mode() === "between") {
      <div class="px-row">
        <input #fromBox aria-label="From" placeholder="From" [value]="from()" (change)="between(fromBox.value, toBox.value)" />
        <input #toBox aria-label="To" placeholder="To" [value]="to()" (change)="between(fromBox.value, toBox.value)" />
      </div>
    } @else if (takesValue()) {
      <input #oneBox aria-label="Value" placeholder="Value" [value]="one()" (change)="single(oneBox.value)" (keydown.enter)="single(oneBox.value)" />
    }
    <p class="px-muted" [hidden]="mode() !== 'not_contains'">Blank cells are kept, as in Excel.</p>
    <button type="button" class="px-link" [hidden]="!filtered()" (click)="apply({ kind: 'none' })">Clear filter</button>
  `
})
export class ColumnFilterComponent {
  /** The view whose filters this edits. */
  public readonly layout = input.required<Layout>();
  /** The column. */
  public readonly column = input.required<string>();
  /** What the column holds, which decides its conditions. */
  public readonly kind = input.required<FieldKind>();
  /** Where the column's values come from, under the view's other filters. */
  public readonly source = input.required<ValueSource>();
  /** Fires with the layout under the new filter. */
  public readonly changed = output<Layout>();

  private readonly condition = computed(() => columnCondition(this.layout(), this.column()));
  protected readonly modes = computed(() => modesOf(this.kind()));
  protected readonly mode = signal<Mode>("values");
  protected readonly filtered = computed(() => this.condition().kind !== "none");
  protected readonly checked = computed((): readonly LayoutScalar[] => {
    const c = this.condition();
    return c.kind === "values" ? c.values : [];
  });
  protected readonly one = computed(() => {
    const c = this.condition();
    return c.kind === "one" ? inputText(c.value) : "";
  });
  protected readonly from = computed(() => {
    const c = this.condition();
    return c.kind === "between" ? inputText(c.from) : "";
  });
  protected readonly to = computed(() => {
    const c = this.condition();
    return c.kind === "between" ? inputText(c.to) : "";
  });
  protected readonly takesValue = computed(() => {
    const m = this.mode();
    return m !== "values" && m !== "between" && m !== "is_null" && m !== "is_not_null";
  });

  constructor() {
    // Another column, or the filter changed elsewhere, shows its own condition.
    effect(() => {
      const condition = this.condition();
      untracked(() => {
        this.mode.set(modeOf(condition));
      });
    });
  }

  protected text(mode: Mode): string {
    return MODE_TEXT[mode];
  }

  protected onMode(event: Event): void {
    const value = event.target instanceof HTMLSelectElement ? event.target.value : "values";
    const mode = this.modes().find((m) => m === value) ?? "values";
    this.mode.set(mode);
    // Conditions without a value apply at once; the others wait for one.
    if (mode === "is_null" || mode === "is_not_null") {
      this.apply({ kind: "one", op: mode, value: null });
    }
  }

  protected single(text: string): void {
    const mode = this.mode();
    if (mode === "values" || mode === "between") {
      return;
    }
    const value = filterValue(this.kind(), text);
    this.apply(value === null ? { kind: "none" } : { kind: "one", op: mode, value });
  }

  protected between(from: string, to: string): void {
    const low = filterValue(this.kind(), from);
    const high = filterValue(this.kind(), to);
    if (low !== null && high !== null) {
      this.apply({ kind: "between", from: low, to: high });
    }
  }

  protected apply(condition: ColumnCondition): void {
    this.changed.emit(withColumnCondition(this.layout(), this.column(), condition));
  }
}
