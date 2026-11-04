/** Export: a click writes an Excel workbook, and its menu offers CSV with every digit. */

import { ChangeDetectionStrategy, Component, ViewEncapsulation, output, signal } from "@angular/core";

import { IconComponent } from "./icon.component";
import { MenuComponent } from "./menu.component";
import { PopoverComponent } from "./popover.component";

@Component({
  selector: "px-export-button",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [IconComponent, MenuComponent, PopoverComponent],
  host: { class: "px-split" },
  template: `
    <button type="button" title="Export the rows shown to Excel" (click)="exported.emit('xlsx')"><px-icon name="download" />Export</button>
    <button #more type="button" aria-label="More export formats" aria-haspopup="menu" [attr.aria-expanded]="open()" (click)="open.set(!open())"><px-icon name="chevron-down" /></button>
    @if (open()) {
      <px-popover [anchor]="more" align="end" (closed)="open.set(false)">
        <px-menu>
          <button type="button" role="menuitem" (click)="pick('xlsx')">Excel workbook<span class="px-menu-note">.xlsx</span></button>
          <button type="button" role="menuitem" (click)="pick('csv')">CSV, every digit<span class="px-menu-note">.csv</span></button>
        </px-menu>
      </px-popover>
    }
  `
})
export class ExportButtonComponent {
  /** Fires when the user asks for an export, with its format. */
  public readonly exported = output<"xlsx" | "csv">();
  protected readonly open = signal(false);

  protected pick(format: "xlsx" | "csv"): void {
    this.open.set(false);
    this.exported.emit(format);
  }
}
