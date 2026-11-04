/** The toolbar's search box. Each keystroke is a new search; Escape clears it. */

import { ChangeDetectionStrategy, Component, ViewEncapsulation, input, output, viewChild } from "@angular/core";
import type { ElementRef } from "@angular/core";

import { IconComponent } from "../ui/icon.component";

@Component({
  selector: "px-search-box",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [IconComponent],
  host: { class: "px-search" },
  template: `
    <px-icon name="search" />
    <input #box type="search" placeholder="Search…" aria-label="Search the grid" [title]="hint()" [value]="text()" (input)="onInput($event)" (keydown.escape)="clear($event)" />
    @if (text() !== "") {
      <button type="button" class="px-icon-button" aria-label="Clear the search" (click)="changed.emit('')"><px-icon name="close" /></button>
    }
  `
})
export class SearchBoxComponent {
  /** The search. */
  public readonly text = input.required<string>();
  /** What the search looks in, said on hover. */
  public readonly hint = input("");
  /** Fires with each new search. */
  public readonly changed = output<string>();
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>("box");

  /** Puts the cursor in the box, selecting its text. */
  public focus(): void {
    const box = this.box().nativeElement;
    box.focus();
    box.select();
  }

  protected onInput(event: Event): void {
    this.changed.emit(event.target instanceof HTMLInputElement ? event.target.value : "");
  }

  protected clear(event: Event): void {
    if (this.text() !== "") {
      event.stopPropagation();
      this.changed.emit("");
    }
  }
}
