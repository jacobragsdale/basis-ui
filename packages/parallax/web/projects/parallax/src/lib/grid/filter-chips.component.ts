/** A chip for each of a layout's filters, each with its own remove button, and Clear all. */

import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input, output } from "@angular/core";

import type { Layout } from "../layout";
import { IconComponent } from "../ui/icon.component";
import { filterLabel, withoutFilter, withoutFilters } from "./edit";

@Component({
  selector: "px-filter-chips",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [IconComponent],
  host: { class: "px-chips" },
  template: `
    @for (chip of chips(); track chip.index) {
      <span class="px-chip" [title]="chip.text">
        <span>{{ chip.text }}</span>
        <button type="button" class="px-icon-button" [attr.aria-label]="'Remove the filter ' + chip.text" (click)="changed.emit(withoutFilter(layout(), chip.index))"><px-icon name="close" /></button>
      </span>
    }
    @if (clearsAll()) {
      <button type="button" class="px-link" (click)="changed.emit(withoutFilters(layout()))">Clear all</button>
    }
  `
})
export class FilterChipsComponent {
  /** The layout whose filters show. */
  public readonly layout = input.required<Layout>();
  /** Fires with the layout after a filter, or every filter and the search, came off. */
  public readonly changed = output<Layout>();

  protected readonly withoutFilter = withoutFilter;
  protected readonly withoutFilters = withoutFilters;
  protected readonly chips = computed(() => {
    const layout = this.layout();
    return layout.filters.map((filter, index) => ({ index, text: filterLabel(filter, (c) => layout.titles[c] ?? c) }));
  });
  /** Clear all shows when it would clear more than one thing. */
  protected readonly clearsAll = computed(() => this.chips().length + (this.layout().search === "" ? 0 : 1) > 1);
}
