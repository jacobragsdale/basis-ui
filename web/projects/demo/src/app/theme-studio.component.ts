import { ChangeDetectionStrategy, Component, DOCUMENT, computed, effect, inject, output, signal } from "@angular/core";
import * as z from "zod/mini";

/** One control of the studio: the token it sets, as a CSS property and as a theme's parameter, and its kind. */
interface Control {
  readonly property: string;
  readonly param: string;
  readonly label: string;
  readonly kind: "color" | "range" | "font" | "switch";
  /** For a range: its bounds, in pixels. For a switch: the value it sets when off. */
  readonly min?: number;
  readonly max?: number;
  readonly off?: string;
}

/** The font's control, a select of the stacks below. */
const FONT: Control = { property: "--px-font-family", param: "fontFamily", label: "Font", kind: "font" };

const CONTROLS: readonly Control[] = [
  { property: "--px-accent", param: "accent", label: "Accent", kind: "color" },
  { property: "--px-background", param: "background", label: "Background", kind: "color" },
  { property: "--px-foreground", param: "foreground", label: "Text", kind: "color" },
  FONT,
  { property: "--px-font-size", param: "fontSize", label: "Font size", kind: "range", min: 11, max: 16 },
  { property: "--px-spacing", param: "spacing", label: "Spacing", kind: "range", min: 3, max: 6 },
  { property: "--px-radius", param: "radius", label: "Corners", kind: "range", min: 0, max: 12 },
  { property: "--px-row-height", param: "rowHeight", label: "Rows", kind: "range", min: 20, max: 40 },
  { property: "--px-column-border", param: "columnBorder", label: "Column lines", kind: "switch", off: "transparent" },
  { property: "--px-stripe", param: "stripe", label: "Stripes", kind: "switch", off: "transparent" }
];

/** The font stacks the studio offers; any installed on the machine show as themselves. */
const FONTS = [
  { label: "System", value: "" },
  { label: "Segoe UI, Helvetica", value: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif" },
  { label: "Rounded", value: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "ui-monospace, Menlo, Consolas, monospace" }
] as const;

/** What the studio has set: a value by CSS property, for the controls moved from their defaults. */
const settingsSchema = z.record(z.string(), z.string());

type Settings = Readonly<Record<string, string>>;

const STORAGE_KEY = "parallax-demo-theme-studio";

/** The settings kept from an earlier visit, or none if storage holds nothing readable. */
function stored(): Settings {
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
    return parsed.success ? Object.fromEntries(Object.entries(parsed.data).filter(([property]) => CONTROLS.some((c) => c.property === property))) : {};
  } catch {
    return {};
  }
}

/** A parameter's value in TypeScript: lengths as numbers of pixels, the rest as strings. */
function tsValue(value: string): string {
  const px = /^(\d+(?:\.\d+)?)px$/.exec(value);
  return px === null ? JSON.stringify(value) : (px[1] ?? value);
}

/**
 * Makes a theme by hand: each control sets one public token on the page's `<body>`, which every grid, pivot and
 * chart reads, whatever theme it was given. The result copies as CSS or as a `defineTheme` call.
 */
@Component({
  selector: "demo-theme-studio",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: "dialog", "aria-label": "Theme studio" },
  template: `
    <header>
      <h2>Theme studio</h2>
      <button type="button" class="close" aria-label="Close the theme studio" (click)="closed.emit()">×</button>
    </header>
    <p class="hint">Each control sets a <code>--px-*</code> property on the page. Every component follows it, whatever its theme.</p>
    <div class="controls">
      @for (c of colors; track c.property) {
        <label
          >{{ c.label }}
          <input type="color" [value]="colorOf(c)" (input)="set(c, $event)" />
        </label>
      }
      <label class="wide"
        >Font
        <select (change)="set(font, $event)">
          @for (f of fonts; track f.label) {
            <option [value]="f.value" [selected]="f.value === (settings()[font.property] ?? '')">{{ f.label }}</option>
          }
        </select>
      </label>
      @for (c of ranges; track c.property) {
        <label
          >{{ c.label }}: {{ pixelsOf(c) }} px
          <input type="range" [min]="c.min ?? 0" [max]="c.max ?? 0" [value]="pixelsOf(c)" (input)="set(c, $event)" />
        </label>
      }
      @for (c of switches; track c.property) {
        <label class="switch"
          ><input type="checkbox" [checked]="settings()[c.property] !== c.off" (change)="set(c, $event)" />
          {{ c.label }}
        </label>
      }
    </div>
    <div class="actions">
      <button type="button" (click)="copy('css')">Copy CSS</button>
      <button type="button" (click)="copy('ts')">Copy TypeScript</button>
      <button type="button" class="quiet" [disabled]="empty()" (click)="reset()">Reset</button>
      <span role="status">{{ note() }}</span>
    </div>
    <pre data-testid="studio-css">{{ css() }}</pre>
  `,
  styles: `
    :host([hidden]) {
      display: none;
    }
    :host {
      position: fixed;
      top: 12px;
      right: 12px;
      bottom: 12px;
      z-index: 20;
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 320px;
      padding: 16px;
      box-sizing: border-box;
      overflow: auto;
      border: 1px solid var(--demo-line);
      border-radius: 12px;
      background: var(--demo-card);
      color: var(--demo-fg);
      box-shadow: 0 12px 32px rgba(16, 24, 40, 0.18);
    }
    header {
      display: flex;
      align-items: center;
    }
    h2 {
      flex: 1;
      margin: 0;
      font-size: 15px;
    }
    .close {
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: inherit;
      font-size: 18px;
      cursor: pointer;
    }
    .close:hover {
      background: var(--demo-hover);
    }
    .hint {
      margin: 0;
      color: var(--demo-muted);
      font-size: 12px;
    }
    .controls {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      color: var(--demo-muted);
    }
    label.wide {
      grid-column: 1 / -1;
    }
    input[type="color"] {
      width: 100%;
      height: 30px;
      padding: 2px;
      border: 1px solid var(--demo-line);
      border-radius: 6px;
      background: var(--demo-card);
    }
    input[type="range"] {
      accent-color: var(--demo-accent);
    }
    input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--demo-accent);
    }
    label.switch {
      flex-direction: row;
      align-items: center;
      gap: 8px;
      color: var(--demo-fg);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .actions button,
    select {
      height: 28px;
      padding: 0 10px;
      border: 1px solid var(--demo-line);
      border-radius: 6px;
      background-color: var(--demo-card);
      color: var(--demo-fg);
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }
    select {
      appearance: none;
      padding-right: 26px;
      background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
      background-position:
        calc(100% - 14px) 55%,
        calc(100% - 9px) 55%;
      background-size: 5px 5px;
      background-repeat: no-repeat;
    }
    .actions button:not(:first-child):hover:not(:disabled) {
      background-color: var(--demo-hover);
    }
    .actions button:first-child {
      border-color: var(--demo-accent);
      background-color: var(--demo-accent);
      color: #ffffff;
    }
    .actions button:disabled {
      color: var(--demo-muted);
      cursor: default;
    }
    .actions span {
      color: var(--demo-muted);
      font-size: 12px;
    }
    pre {
      margin: 0;
      padding: 10px;
      overflow: auto;
      border: 1px solid var(--demo-line);
      border-radius: 8px;
      background: var(--demo-page);
      font-size: 11px;
      white-space: pre-wrap;
    }
  `
})
export class ThemeStudioComponent {
  /** Fires when the studio is closed; its settings stay. */
  public readonly closed = output();

  protected readonly colors = CONTROLS.filter((c) => c.kind === "color");
  protected readonly ranges = CONTROLS.filter((c) => c.kind === "range");
  protected readonly switches = CONTROLS.filter((c) => c.kind === "switch");
  protected readonly font = FONT;
  protected readonly fonts = FONTS;
  protected readonly settings = signal<Settings>(stored());
  protected readonly note = signal("");
  protected readonly empty = computed(() => Object.keys(this.settings()).length === 0);

  /** The settings as CSS, ready to paste into a stylesheet. */
  protected readonly css = computed(() => {
    const lines = Object.entries(this.settings()).map(([property, value]) => `  ${property}: ${value};`);
    return lines.length === 0 ? "/* Move a control to make a theme. */" : `:root {\n${lines.join("\n")}\n}`;
  });

  /** The settings as a theme, for `provideParallax({ theme })` or a component's `theme` input. */
  private readonly typescript = computed(() => {
    const params = CONTROLS.flatMap((c) => {
      const value = this.settings()[c.property];
      return value === undefined ? [] : [`    ${c.param}: ${tsValue(value)}`];
    });
    return `export const myTheme = defineTheme({\n  name: "mine",\n  params: {\n${params.join(",\n")}\n  }\n});`;
  });

  private readonly document = inject(DOCUMENT);

  constructor() {
    // The tokens go on <body>: every component inherits them, and a change there tells them to read their tokens again.
    effect(() => {
      const settings = this.settings();
      const style = this.document.body.style;
      for (const c of CONTROLS) {
        const value = settings[c.property];
        if (value === undefined) {
          style.removeProperty(c.property);
        } else {
          style.setProperty(c.property, value);
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    });
  }

  /** A colour control's value: the one set, or a neutral starting point. */
  protected colorOf(c: Control): string {
    return this.settings()[c.property] ?? (c.property === "--px-foreground" ? "#1d2330" : c.property === "--px-background" ? "#ffffff" : "#2563eb");
  }

  /** A range control's value in pixels: the one set, or the library's default. */
  protected pixelsOf(c: Control): number {
    const set = this.settings()[c.property];
    const defaults: Readonly<Record<string, number>> = { "--px-font-size": 13, "--px-spacing": 4, "--px-radius": 6, "--px-row-height": 24 };
    return set === undefined ? (defaults[c.property] ?? 0) : Number.parseFloat(set);
  }

  protected set(c: Control, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
      return;
    }
    const value = c.kind === "range" ? `${target.value}px` : c.kind === "switch" ? (target instanceof HTMLInputElement && target.checked ? "" : (c.off ?? "")) : target.value;
    this.settings.update((settings) => {
      const others = Object.fromEntries(Object.entries(settings).filter(([property]) => property !== c.property));
      return value === "" ? others : { ...others, [c.property]: value };
    });
    this.note.set("");
  }

  protected reset(): void {
    this.settings.set({});
    this.note.set("");
  }

  protected copy(as: "css" | "ts"): void {
    const text = as === "css" ? this.css() : this.typescript();
    navigator.clipboard.writeText(text).then(
      () => {
        this.note.set(as === "css" ? "CSS copied" : "TypeScript copied");
      },
      () => {
        this.note.set("The clipboard refused it");
      }
    );
  }
}
