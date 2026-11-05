/**
 * The strip above a grid where its groups show: a chip for each level, outermost first, that ungroups it, and Expand
 * all and Collapse all. A header dragged onto the strip groups the grid by its column.
 */

import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input, output } from "@angular/core";

import type { Layout } from "../layout";
import { IconComponent } from "../ui/icon.component";
import { withAllExpanded, withoutGroup } from "./edit";

@Component({
  selector: "px-group-panel",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [IconComponent],
  host: { class: "px-group-panel", role: "region", "aria-label": "Groups", "[attr.data-drop]": "dropping()" },
  styles: `
    .px-group-panel {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      padding: 2px 8px;
      border-bottom: 1px solid var(--_px-border-color);
      background: var(--_px-background);
      color: var(--_px-muted);
      font: var(--_px-font-size) var(--_px-font-family);
      font-size: 12px;
    }
    .px-group-panel[data-drop="true"] {
      outline: 2px dashed var(--_px-accent);
      outline-offset: -3px;
      background: var(--_px-chip-background);
    }
    .px-group-panel .px-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 24px;
      padding: 0 2px 0 8px;
      border: 1px solid var(--_px-control-border);
      border-radius: 12px;
      background: var(--_px-control-background);
      color: var(--_px-control-foreground);
    }
    .px-group-panel .px-chip button,
    .px-group-panel .px-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      height: 22px;
      border: 0;
      border-radius: 11px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .px-group-panel .px-link {
      color: var(--_px-accent);
    }
    .px-group-panel .px-spring {
      flex: 1;
    }
  `,
  template: `
    <span [hidden]="grouped()">Drag a column header here to group by it</span>
    @for (group of groups(); track group.column; let last = $last) {
      <span class="px-chip">
        <px-icon name="group" />{{ group.title }}
        <button type="button" [attr.aria-label]="'Stop grouping by ' + group.title" (click)="changed.emit(withoutGroup(layout(), group.column))"><px-icon name="close" /></button>
      </span>
      <span [hidden]="last" aria-hidden="true">›</span>
    }
    <span class="px-spring"></span>
    <button type="button" class="px-link" [hidden]="!grouped()" (click)="changed.emit(withAllExpanded(layout(), true))"><px-icon name="expand" />Expand all</button>
    <button type="button" class="px-link" [hidden]="!grouped()" (click)="changed.emit(withAllExpanded(layout(), false))"><px-icon name="collapse" />Collapse all</button>
  `
})
export class GroupPanelComponent {
  /** The grid's layout. */
  public readonly layout = input.required<Layout>();
  /** Whether a header is dragged over the strip, which would group by its column. */
  public readonly dropping = input(false);
  /** Fires with each edited layout. */
  public readonly changed = output<Layout>();

  protected readonly withoutGroup = withoutGroup;
  protected readonly withAllExpanded = withAllExpanded;
  protected readonly grouped = computed(() => this.layout().group_by.length > 0);
  protected readonly groups = computed(() => {
    const layout = this.layout();
    return layout.group_by.map((column) => ({ column, title: layout.titles[column] ?? column }));
  });
}
