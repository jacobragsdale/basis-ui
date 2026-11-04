/**
 * A panel anchored to the control that opened it. It opens below the anchor, or above it when there is no room, and
 * shifts left to stay on screen. Escape, or a press outside it and its anchor, closes it, and focus goes back to the
 * anchor, as a menu's does.
 */

import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, ElementRef, Injector, ViewEncapsulation, afterNextRender, inject, input, output, signal } from "@angular/core";

/** The gap between the anchor and the panel, and the panel and the window's edge. */
const GAP = 4;

/** Where a panel of `size` goes beside `anchor`, kept inside a window of `width` by `height`. */
export function placement(
  anchor: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number },
  size: { readonly width: number; readonly height: number },
  window: { readonly width: number; readonly height: number },
  align: "start" | "end" = "start"
): { readonly top: number; readonly left: number } {
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - size.height;
  const top = below + size.height <= window.height - GAP || above < GAP ? below : above;
  const wanted = align === "start" ? anchor.left : anchor.right - size.width;
  const left = Math.max(GAP, Math.min(wanted, window.width - GAP - size.width));
  return { top: Math.max(GAP, top), left };
}

@Component({
  selector: "px-popover",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: "px-popover-panel",
    "[style.top.px]": "position().top",
    "[style.left.px]": "position().left",
    "[style.visibility]": "placed() ? 'visible' : 'hidden'",
    "(keydown.escape)": "dismiss($event)"
  },
  styles: `
    .px-popover-panel {
      position: fixed;
      z-index: 1000;
      max-width: min(420px, calc(100vw - 8px));
      max-height: calc(100vh - 8px);
      overflow: auto;
      padding: 4px;
      border: 1px solid var(--px-control-border);
      border-radius: var(--px-radius);
      background: var(--px-control-bg);
      color: var(--px-control-fg);
      box-shadow: var(--px-shadow);
      font: var(--px-font);
      text-align: start;
    }
  `,
  template: `<ng-content />`
})
export class PopoverComponent {
  /** The control the panel belongs to, which gets focus back when it closes. */
  public readonly anchor = input.required<HTMLElement>();
  /** Which edge of the anchor the panel lines up with. */
  public readonly alignTo = input<"start" | "end">("start");
  /** What gets focus back when the panel closes, if not the anchor, as when the anchor only marks a place. */
  public readonly restore = input<HTMLElement | null>(null);
  /** Fires when the panel asks to close: Escape, or a press outside it. */
  public readonly closed = output();

  protected readonly position = signal({ top: 0, left: 0 });
  protected readonly placed = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    const document = inject(DOCUMENT);
    const window = document.defaultView;
    const place = (): void => {
      const anchor = this.anchor().getBoundingClientRect();
      const panel = this.host.getBoundingClientRect();
      this.position.set(placement(anchor, panel, { width: window?.innerWidth ?? 1024, height: window?.innerHeight ?? 768 }, this.alignTo()));
      this.placed.set(true);
    };
    const outside = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && !this.host.contains(target) && !this.anchor().contains(target)) {
        this.closed.emit();
      }
    };
    const injector = inject(Injector);
    afterNextRender(() => {
      place();
      // The panel shows on the render that placing it causes; until then it is hidden, and a hidden control can't
      // take focus, which also leaves Escape with nothing to close.
      afterNextRender(
        () => {
          this.host.querySelector<HTMLElement>("[autofocus], input, button, [role='menuitem'], [tabindex='0']")?.focus();
        },
        { injector }
      );
      document.addEventListener("pointerdown", outside, true);
      window?.addEventListener("resize", place);
    });
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener("pointerdown", outside, true);
      window?.removeEventListener("resize", place);
      // Focus goes back to the control that opened the panel, unless it moved elsewhere on purpose.
      const active = document.activeElement;
      if (active === null || active === document.body || this.host.contains(active)) {
        (this.restore() ?? this.anchor()).focus({ preventScroll: true });
      }
    });
  }

  protected dismiss(event: Event): void {
    event.stopPropagation();
    this.closed.emit();
  }
}
