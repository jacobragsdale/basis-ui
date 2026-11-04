/** Small line icons, 16 px, drawn in the text colour so they follow the theme. */

import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input } from "@angular/core";

/** The icons the library draws. */
export type IconName = "search" | "close" | "download" | "chevron-down" | "filter" | "columns" | "sum" | "pin" | "check" | "group" | "drag" | "expand" | "collapse";

/** Each icon's strokes, as SVG path data on a 16-unit square. */
const PATHS: Readonly<Record<IconName, readonly string[]>> = {
  search: ["M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0z", "M10.5 10.5 14 14"],
  close: ["M4 4l8 8M12 4l-8 8"],
  download: ["M8 2.5v7.5M4.75 6.75 8 10l3.25-3.25M3 13.5h10"],
  "chevron-down": ["M4 6l4 4 4-4"],
  filter: ["M2.5 3h11L9.25 8.25v4.75l-2.5-1.25V8.25z"],
  columns: ["M4 3h8a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 4 3z", "M6.25 3v10M9.75 3v10"],
  sum: ["M12 3H4.5L9 8l-4.5 5H12"],
  pin: ["M5.5 2.5h5M6.5 2.5v4l-2 2.5h7l-2-2.5v-4M8 9v5"],
  check: ["M3 8.5 6.5 12 13 4.5"],
  group: ["M2.5 3.5h11M5.5 8h8M5.5 12.5h8"],
  drag: ["M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01"],
  expand: ["M3 5.5 8 10.5l5-5"],
  collapse: ["M3 10.5 8 5.5l5 5"]
};

@Component({
  selector: "px-icon",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: "px-icon", "aria-hidden": "true" },
  styles: `
    .px-icon {
      display: inline-flex;
      flex: none;
      width: 16px;
      height: 16px;
    }
    .px-icon svg {
      width: 100%;
      height: 100%;
    }
  `,
  template: `
    <svg viewBox="0 0 16 16" stroke="currentColor" [attr.stroke-width]="name() === 'drag' ? 2.25 : 1.5" stroke-linecap="round" stroke-linejoin="round" [attr.fill]="filled() ? 'currentColor' : 'none'">
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `
})
export class IconComponent {
  public readonly name = input.required<IconName>();
  /** Fills the shape, as a funnel does for a filtered column. */
  public readonly filled = input(false);
  protected readonly paths = computed(() => PATHS[this.name()]);
}
