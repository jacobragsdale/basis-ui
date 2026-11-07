/**
 * The looks the demo offers: the library's two themes, and two made here with `defineTheme`, as an application would
 * make its own.
 */

import { airyTheme, defineTheme, standardTheme, token } from "parallax";
import type { ParallaxTheme } from "parallax";
import * as z from "zod/mini";

/** A warm look: cream chrome, a burnt-orange accent, warm greys and rounder corners. */
const warmTheme = defineTheme({
  name: "demo-warm",
  params: { radius: 8, wrapperRadius: 12, series: ["#c2410c", "#0f766e", "#b45309", "#7c3aed", "#be185d", "#15803d", "#1d4ed8", "#a16207"] },
  light: { accent: "#c2410c", background: "#fffdf9", foreground: "#2b2118", muted: "#7c6f64", chromeBackground: "#fbf3e8", negative: "#b91c1c" },
  dark: { accent: "#fb923c", background: "#1c1714", foreground: "#efe6dc", muted: "#a8998b", chromeBackground: "#261f1a", negative: "#f87171", onAccent: "#1c1714" }
});

/** A high-contrast look: black and white, firm lines, and a strong accent for selections and focus. */
const contrastTheme = defineTheme({
  name: "demo-contrast",
  params: {
    headerFontWeight: "700",
    groupFontWeight: "700",
    stripe: `color-mix(in srgb, ${token("foreground")} 6%, ${token("background")})`,
    selectionBackground: `color-mix(in srgb, ${token("accent")} 25%, transparent)`,
    focus: `color-mix(in srgb, ${token("accent")} 70%, transparent)`
  },
  light: { accent: "#0038d1", background: "#ffffff", foreground: "#000000", muted: "#3a3a3a", borderColor: "#000000", columnBorder: "#8c8c8c", headerBackground: "#ffffff", negative: "#a30000" },
  dark: {
    accent: "#ffd60a",
    background: "#000000",
    foreground: "#ffffff",
    muted: "#d6d6d6",
    borderColor: "#ffffff",
    columnBorder: "#7a7a7a",
    headerBackground: "#000000",
    negative: "#ff8a8a",
    onAccent: "#000000"
  }
});

/** A look's name, as the address bar and the picker give it. */
export const lookSchema = z.enum(["standard", "airy", "warm", "contrast"]);

export type Look = z.infer<typeof lookSchema>;

/** The looks, by the name the address bar keeps. */
export const LOOKS: Readonly<Record<Look, { readonly title: string; readonly theme: ParallaxTheme }>> = {
  standard: { title: "Standard", theme: standardTheme },
  airy: { title: "Airy", theme: airyTheme },
  warm: { title: "Warm", theme: warmTheme },
  contrast: { title: "High contrast", theme: contrastTheme }
};
