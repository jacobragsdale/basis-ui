/**
 * One value of a pivot, as a menu: how it is computed (aggregate, column, weight or percentile), shown (show as and its
 * number format) and placed (move, remove). A measure's header adds sorting the groups by it. The field list's Values
 * chips and the pivot's headers share it, so a value reads the same wherever it is edited.
 */

import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input, output } from "@angular/core";

import type { SourceField } from "../grid/grid-source";
import { AGGREGATES, SHOW_AS } from "../layout";
import type { Layout, LayoutFormat, LayoutMeasure } from "../layout";
import { MenuComponent } from "../ui/menu.component";
import { measure, measureSort, moveMeasure, removeMeasure, updateMeasure, withMeasureFormat, withMeasureSort } from "./edit";
import { NUMERIC_AGGREGATES, NUMERIC_KINDS, choices, fieldChoices, measureName } from "./labels";
import type { Choice } from "./labels";
import { SelectComponent } from "./select.component";

/** Decimal places a value can show; auto keeps the column's own. */
const DECIMALS: readonly Choice[] = [{ value: "", text: "Auto" }, ...[0, 1, 2, 3, 4, 6].map((d) => ({ value: String(d), text: String(d) }))];

const ABBREVIATIONS: readonly Choice[] = [
  { value: "", text: "None" },
  { value: "thousands", text: "Thousands (K)" },
  { value: "millions", text: "Millions (M)" },
  { value: "billions", text: "Billions (B)" }
];

const NEGATIVES: readonly Choice[] = [
  { value: "minus", text: "-1,234" },
  { value: "parentheses", text: "(1,234)" }
];

@Component({
  selector: "px-measure-menu",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [MenuComponent, SelectComponent],
  host: { class: "px-measure-menu", "[attr.aria-label]": "'Value ' + name()" },
  styles: `
    .px-measure-menu {
      display: flex;
      flex-direction: column;
      width: 280px;
    }
    .px-measure-menu hr {
      width: 100%;
      margin: var(--_px-spacing) 0;
      border: 0;
      border-top: 1px solid var(--_px-border-color);
    }
    .px-measure-menu .px-menu-fields {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: calc(var(--_px-spacing) * 1.5) calc(var(--_px-spacing) * 2);
      align-items: center;
      padding: calc(var(--_px-spacing) * 1.5) calc(var(--_px-spacing) * 2.5);
    }
    .px-measure-menu .px-menu-fields span {
      color: var(--_px-muted);
    }
    .px-measure-menu .px-menu-fields select,
    .px-measure-menu .px-menu-fields input {
      width: 100%;
      height: var(--_px-control-height);
      padding: 0 calc(var(--_px-spacing) * 1.5);
      border: 1px solid var(--_px-control-border);
      border-radius: calc(var(--_px-radius) - 2px);
      background: var(--_px-control-background);
      color: var(--_px-control-foreground);
      font: inherit;
    }
  `,
  template: `
    @if (sorting()) {
      <px-menu>
        <button type="button" role="menuitem" (click)="finish(sorted(true))">Sort largest first</button>
        <button type="button" role="menuitem" (click)="finish(sorted(false))">Sort smallest first</button>
        <button type="button" role="menuitem" [disabled]="sort() === null" (click)="finish(sorted(null))">Clear sort</button>
      </px-menu>
      <hr />
    }
    <div class="px-menu-fields">
      <span>Aggregate</span>
      <px-select label="Aggregate" [choices]="aggregates" [value]="measure().aggregate" (picked)="setAggregate($event)" />
      @if (measure().aggregate !== "count_all") {
        <span>Column</span>
        <px-select label="Column" [choices]="columns()" [value]="measure().column ?? ''" (picked)="patch({ column: $event })" />
      }
      @if (measure().aggregate === "weighted_mean") {
        <span>Weight</span>
        <px-select label="Weight" [choices]="weights()" [value]="measure().weight ?? ''" (picked)="patch({ weight: $event === '' ? null : $event })" />
      }
      @if (measure().aggregate === "percentile") {
        <span>Percentile</span>
        <input aria-label="Percentile" type="number" min="0" max="1" step="0.05" [value]="measure().percentile ?? 0.5" (change)="setPercentile($event)" />
      }
      <span>Show as</span>
      <px-select label="Show as" [choices]="showAs" [value]="measure().show_as" (picked)="setShowAs($event)" />
      <span>Decimals</span>
      <px-select label="Decimals" [choices]="decimals" [value]="format().decimals" (picked)="setDecimals($event)" />
      <span>Abbreviate</span>
      <px-select label="Abbreviate" [choices]="abbreviations" [value]="format().abbreviate" (picked)="setAbbreviate($event)" />
      <span>Negatives</span>
      <px-select label="Negatives" [choices]="negatives" [value]="format().negative" (picked)="setNegative($event)" />
    </div>
    <hr />
    <px-menu>
      <button type="button" role="menuitem" [disabled]="index() === 0" (click)="finish(moved(-1))">{{ sorting() ? "Move left" : "Move up" }}</button>
      <button type="button" role="menuitem" [disabled]="index() === layout().measures.length - 1" (click)="finish(moved(1))">{{ sorting() ? "Move right" : "Move down" }}</button>
      <button type="button" role="menuitem" (click)="finish(removed())">Remove value</button>
    </px-menu>
  `
})
export class MeasureMenuComponent {
  /** The pivot's layout. */
  public readonly layout = input.required<Layout>();
  /** Which measure the menu edits. */
  public readonly index = input.required<number>();
  /** The dataset's columns. */
  public readonly fields = input.required<readonly SourceField[]>();
  /** Whether to offer sorting the groups by the measure, as its header does. */
  public readonly sorting = input(false);
  /** Fires with each edited layout. */
  public readonly changed = output<Layout>();
  /** Fires when a choice ends the menu's work, so it can close. */
  public readonly done = output();

  protected readonly aggregates = choices(AGGREGATES);
  protected readonly showAs = choices(SHOW_AS);
  protected readonly decimals = DECIMALS;
  protected readonly abbreviations = ABBREVIATIONS;
  protected readonly negatives = NEGATIVES;
  protected readonly measure = computed((): LayoutMeasure => this.layout().measures[this.index()] ?? measure("count_all", null));
  protected readonly name = computed(() => measureName(this.measure()));
  protected readonly sort = computed(() => measureSort(this.layout(), this.index()));
  /** The format's parts as the selects hold them. */
  protected readonly format = computed(() => {
    const f = this.measure().format;
    const decimals = f?.decimals ?? null;
    return { decimals: decimals === null ? "" : String(decimals), abbreviate: f?.abbreviate ?? "", negative: f?.negative ?? "minus" };
  });
  private readonly numeric = computed(() => this.fields().filter((f) => NUMERIC_KINDS.includes(f.kind)));
  protected readonly columns = computed(() => fieldChoices(NUMERIC_AGGREGATES.includes(this.measure().aggregate) ? this.numeric() : this.fields()));
  protected readonly weights = computed(() => [{ value: "", text: "weight…" }, ...fieldChoices(this.numeric())]);

  protected sorted(descending: boolean | null): Layout {
    return withMeasureSort(this.layout(), this.index(), descending);
  }

  protected moved(delta: number): Layout {
    return moveMeasure(this.layout(), this.index(), delta);
  }

  protected removed(): Layout {
    return removeMeasure(this.layout(), this.index());
  }

  protected finish(next: Layout): void {
    this.changed.emit(next);
    this.done.emit();
  }

  protected patch(patch: Partial<LayoutMeasure>): void {
    this.changed.emit(updateMeasure(this.layout(), this.index(), patch));
  }

  private reformat(patch: Partial<LayoutFormat>): void {
    this.changed.emit(withMeasureFormat(this.layout(), this.index(), patch));
  }

  protected setAggregate(value: string): void {
    const aggregate = AGGREGATES.find((a) => a === value);
    if (aggregate === undefined) {
      return;
    }
    const current = this.measure();
    const allowed = NUMERIC_AGGREGATES.includes(aggregate) ? this.numeric() : this.fields();
    const column = aggregate === "count_all" ? null : allowed.some((f) => f.name === current.column) ? current.column : (allowed[0]?.name ?? null);
    this.patch({ aggregate, column, percentile: aggregate === "percentile" ? (current.percentile ?? 0.5) : null, weight: aggregate === "weighted_mean" ? current.weight : null });
  }

  protected setShowAs(value: string): void {
    const showAs = SHOW_AS.find((s) => s === value);
    if (showAs !== undefined) {
      this.patch({ show_as: showAs });
    }
  }

  protected setPercentile(event: Event): void {
    const value = event.target instanceof HTMLInputElement ? Number(event.target.value) : Number.NaN;
    if (Number.isFinite(value) && value >= 0 && value <= 1) {
      this.patch({ percentile: value });
    }
  }

  protected setDecimals(value: string): void {
    const decimals = Number(value);
    this.reformat({ decimals: value === "" || !Number.isInteger(decimals) ? null : decimals });
  }

  protected setAbbreviate(value: string): void {
    const abbreviate = (["thousands", "millions", "billions"] as const).find((a) => a === value) ?? null;
    this.reformat({ abbreviate });
  }

  protected setNegative(value: string): void {
    this.reformat({ negative: value === "parentheses" ? "parentheses" : "minus" });
  }
}
