/* The theme studio's controls and what it makes of them. Each control sets one of parallax's public tokens, a `--px-*`
 * property, on the page's `<body>`, where every grid, pivot and chart inherits it whatever its theme, and a change
 * there tells their canvases to read their tokens again. The result copies as CSS or as a `defineTheme` call. */

import { z } from "zod";

/** One control of the studio: the token it sets, as a CSS property and as a theme's parameter, and its kind. */
interface Control {
  readonly property: string;
  readonly param: string;
  readonly label: string;
}

interface ColorControl extends Control {
  /** The colour it shows before it is set. */
  readonly start: string;
}

interface RangeControl extends Control {
  /** Its bounds and the value it shows before it is set, in pixels. */
  readonly min: number;
  readonly max: number;
  readonly start: number;
}

interface SwitchControl extends Control {
  /** The value it sets when off. */
  readonly off: string;
}

const colors: readonly ColorControl[] = [
  { label: "Accent", param: "accent", property: "--px-accent", start: "#2563eb" },
  { label: "Background", param: "background", property: "--px-background", start: "#ffffff" },
  { label: "Text", param: "foreground", property: "--px-foreground", start: "#1d2330" },
];

const font: Control = { label: "Font", param: "fontFamily", property: "--px-font-family" };

/** The font stacks the studio offers; the first is the theme's own, @basis/ui's Inter. */
const fonts: readonly { readonly label: string; readonly value: string }[] = [
  { label: "The theme's", value: "" },
  { label: "System", value: "system-ui, sans-serif" },
  { label: "Segoe UI, Helvetica", value: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "'JetBrains Mono Variable', ui-monospace, monospace" },
];

const ranges: readonly RangeControl[] = [
  {
    label: "Font size",
    max: 16,
    min: 11,
    param: "fontSize",
    property: "--px-font-size",
    start: 13,
  },
  { label: "Spacing", max: 6, min: 3, param: "spacing", property: "--px-spacing", start: 4 },
  { label: "Corners", max: 12, min: 0, param: "radius", property: "--px-radius", start: 6 },
  { label: "Rows", max: 40, min: 20, param: "rowHeight", property: "--px-row-height", start: 24 },
];

const switches: readonly SwitchControl[] = [
  {
    label: "Column lines",
    off: "transparent",
    param: "columnBorder",
    property: "--px-column-border",
  },
  { label: "Stripes", off: "transparent", param: "stripe", property: "--px-stripe" },
];

const controls: readonly Control[] = [...colors, font, ...ranges, ...switches];

/** What the studio has set: a value by CSS property, for the controls moved from where they start. */
type Settings = Readonly<Record<string, string>>;

const settingsSchema = z.record(z.string(), z.string());
const storageKey = "parallax-demo-theme-studio";

/** The settings kept from an earlier visit, or none if the browser keeps nothing readable. */
function storedSettings(): Settings {
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(localStorage.getItem(storageKey) ?? "{}"));
    if (!parsed.success) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed.data).filter(([property]) =>
        controls.some((control) => control.property === property),
      ),
    );
  } catch {
    return {};
  }
}

/** Puts the settings on `<body>` and keeps them for the next visit. */
function applySettings(settings: Settings): void {
  const { style } = document.body;
  for (const { property } of controls) {
    const value = settings[property];
    if (value === undefined) {
      style.removeProperty(property);
    } else {
      style.setProperty(property, value);
    }
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    // A browser that keeps nothing still shows the theme until the page goes.
  }
}

/** The settings with `property` set to `value`, or unset when `value` is empty. */
function withSetting(settings: Settings, property: string, value: string): Settings {
  const others = Object.fromEntries(Object.entries(settings).filter(([key]) => key !== property));
  return value === "" ? others : { ...others, [property]: value };
}

/** The settings as CSS, ready to paste into a stylesheet. */
function settingsCss(settings: Settings): string {
  const lines = Object.entries(settings).map(([property, value]) => `  ${property}: ${value};`);
  return lines.length === 0
    ? "/* Move a control to make a theme. */"
    : `:root {\n${lines.join("\n")}\n}`;
}

/** A parameter's value in TypeScript: lengths as numbers of pixels, the rest as strings. */
function typescriptValue(value: string): string {
  const pixels = /^(?<length>\d+(?:\.\d+)?)px$/u.exec(value)?.groups?.["length"];
  return pixels ?? JSON.stringify(value);
}

/** The settings as a theme over @basis/ui's, for `ParallaxProvider`'s `theme`. */
function settingsTypescript(settings: Settings): string {
  const params = controls.flatMap((control) => {
    const value = settings[control.property];
    return value === undefined ? [] : [`    ${control.param}: ${typescriptValue(value)},`];
  });
  return [
    'import { basisTheme, defineTheme } from "@basis/parallax";',
    "",
    "export const myTheme = defineTheme({",
    "  extends: basisTheme,",
    '  name: "mine",',
    "  params: {",
    ...params,
    "  },",
    "});",
  ].join("\n");
}

export {
  applySettings,
  colors,
  font,
  fonts,
  ranges,
  settingsCss,
  settingsTypescript,
  storedSettings,
  switches,
  withSetting,
};
export type { ColorControl, RangeControl, Settings, SwitchControl };
