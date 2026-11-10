// A theme's lengths, shadows and scales as CSS declarations: pure functions of a theme's inputs, which `css.ts` places
// under each theme's selectors.

import type {
  ControlSize,
  ControlSizeName,
  Mode,
  RadiusName,
  ThemeInputs,
  TypeStep,
} from "./inputs.ts";
import type { Density } from "./preferences.ts";

/** The pixels in a rem, at the browser's default font size. */
const pixelsPerRem = 16;

/** The control sizes, from the smallest. */
const controlSizes: readonly ControlSizeName[] = ["xs", "sm", "md", "lg"];

/** Where the text starts in a control whose icon sits at its start: the inset beside the icon, the icon and the gap. A
 * menu's item without an icon is indented by it, so that its text lines up with its neighbours'. */
function indentOf({ insetBesideIcon, icon, gap }: ControlSize): number {
  return insetBesideIcon + icon + gap;
}

/** A length in pixels as rem, which is whole pixels at the default font size. */
function rem(pixels: number): string {
  return `${String(pixels / pixelsPerRem)}rem`;
}

/** A control size's lengths, each by the name its variable takes after the size. */
function lengthsOf(lengths: ControlSize): readonly (readonly [string, number])[] {
  return [
    ["gap", lengths.gap],
    ["height", lengths.height],
    ["icon", lengths.icon],
    ["inset", lengths.inset],
    ["inset-icon", lengths.insetBesideIcon],
    ["indent", indentOf(lengths)],
  ];
}

/** One density's control lengths as declarations. A component reads them as `h-(--control-md-height)`,
 * `px-(--control-md-inset)`, `pl-(--control-md-inset-icon)`, `size-(--control-md-icon)` and `gap-(--control-md-gap)`:
 * variables, not named utilities, so that `cn` merges an app's `h-9` or `size-6` over them, where it would keep both of
 * two named ones. */
function controlDeclarations(theme: ThemeInputs, density: Density): string {
  return controlSizes
    .flatMap((size) =>
      lengthsOf(theme.controls[density][size]).map(
        ([name, pixels]) => `  --control-${size}-${name}: ${rem(pixels)};`,
      ),
    )
    .join("\n");
}

/** A theme's two shadows in a mode, as declarations. */
function shadowDeclarations(theme: ThemeInputs, inMode: Mode): string {
  const { floating, raised } = theme.shadows[inMode];
  return `  --shadow-raised: ${raised};
  --shadow-floating: ${floating};`;
}

/** The type scale's steps, from the smallest. */
const typeSteps: readonly TypeStep[] = ["2xs", "xs", "sm", "base", "lg", "xl", "2xl"];

/** The named radii, from the smallest. */
const radiusNames: readonly RadiusName[] = ["sm", "md", "lg", "xl"];

/** A radius as a multiple of the base radius, which stays a variable. */
function radiusOf(multiple: number): string {
  return multiple === 1 ? "var(--radius)" : `calc(var(--radius) * ${String(multiple)})`;
}

/** The variables of a theme's own that Tailwind's utilities read: the default declares them in `@theme`, which makes
 * the utilities, and every other theme declares them again in its own block. */
function scaleDeclarations(theme: ThemeInputs): string {
  return [
    `  --opacity-disabled: ${theme.disabled};`,
    `  --spacing: ${theme.spacing.compact};`,
    ...typeSteps.flatMap((step) => [
      `  --text-${step}: ${theme.type[step].size};`,
      `  --text-${step}--line-height: ${theme.type[step].lineHeight};`,
    ]),
    `  --font-sans: ${theme.fonts.sans};`,
    `  --font-mono: ${theme.fonts.mono};`,
    `  --default-transition-duration: ${theme.motion.control};`,
    `  --transition-duration-popup: ${theme.motion.popup};`,
    `  --transition-duration-panel: ${theme.motion.panel};`,
    ...radiusNames.map((name) => `  --radius-${name}: ${radiusOf(theme.radius.scale[name])};`),
  ].join("\n");
}

export { controlDeclarations, scaleDeclarations, shadowDeclarations };
