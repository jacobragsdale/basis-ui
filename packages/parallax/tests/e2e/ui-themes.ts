/* The themes @basis/ui ships besides its default, which the end-to-end screenshots draw parallax in too: a harness
 * opened with `?ui=NAME` puts the theme on its root, as @basis/ui's preferences do. A unit test holds the list to
 * @basis/ui's `themeNames`. */

/** @basis/ui's themes other than the default, in its order. */
const otherThemes = ["desk", "high-contrast"] as const;

/** The one screenshot each suite takes in each of the other themes, to show the theme is followed: desk in light mode,
 * and high-contrast in dark. Everything else is screenshotted in the default theme alone, as the maintainer decided on
 * 2026-11-11. */
const themeProbes = [
  { mode: "light", ui: "desk" },
  { mode: "dark", ui: "high-contrast" },
] as const satisfies readonly { mode: "light" | "dark"; ui: (typeof otherThemes)[number] }[];

export { otherThemes, themeProbes };
