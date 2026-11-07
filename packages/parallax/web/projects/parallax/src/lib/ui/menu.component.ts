/** A list of commands, moved through with the arrow keys, Home and End, as a menu is. */

import { ChangeDetectionStrategy, Component, ElementRef, ViewEncapsulation, inject } from "@angular/core";

@Component({
  selector: "px-menu",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: "px-menu", role: "menu", "(keydown)": "onKey($event)" },
  styles: `
    .px-menu {
      display: flex;
      flex-direction: column;
      min-width: 180px;
    }
    .px-menu [role="menuitem"],
    .px-menu [role="menuitemcheckbox"] {
      display: flex;
      align-items: center;
      gap: calc(var(--_px-spacing) * 2);
      padding: calc(var(--_px-spacing) * 1.5) calc(var(--_px-spacing) * 2.5);
      border: 0;
      border-radius: calc(var(--_px-radius) - 2px);
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      white-space: nowrap;
    }
    .px-menu [role="menuitem"]:hover,
    .px-menu [role="menuitem"]:focus-visible,
    .px-menu [role="menuitemcheckbox"]:hover,
    .px-menu [role="menuitemcheckbox"]:focus-visible {
      background: var(--_px-control-hover);
      outline: none;
    }
    .px-menu [role="menuitem"]:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .px-menu .px-menu-note {
      margin-left: auto;
      color: var(--_px-muted);
      font-size: var(--_px-font-size-small);
    }
    .px-menu hr {
      width: 100%;
      margin: var(--_px-spacing) 0;
      border: 0;
      border-top: 1px solid var(--_px-border-color);
    }
  `,
  template: `<ng-content />`
})
export class MenuComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected onKey(event: KeyboardEvent): void {
    const items = [...this.host.querySelectorAll<HTMLElement>("[role='menuitem']:not(:disabled), [role='menuitemcheckbox']:not(:disabled)")];
    if (items.length === 0) {
      return;
    }
    const at = items.findIndex((item) => item === this.host.ownerDocument.activeElement);
    const next = ((): number | null => {
      switch (event.key) {
        case "ArrowDown":
          return (at + 1) % items.length;
        case "ArrowUp":
          return (at - 1 + items.length) % items.length;
        case "Home":
          return 0;
        case "End":
          return items.length - 1;
        default:
          return null;
      }
    })();
    if (next !== null) {
      event.preventDefault();
      items[next]?.focus();
    }
  }
}
