/* The themes @basis/ui ships besides its default, which the end-to-end screenshots draw parallax in too: a harness
 * opened with `?ui=NAME` puts the theme on its root, as @basis/ui's preferences do. A unit test holds the list to
 * @basis/ui's `themeNames`. */

/** @basis/ui's themes other than the default, in its order. */
const otherThemes = ["desk", "high-contrast"] as const;

export { otherThemes };
