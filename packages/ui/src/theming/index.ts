/* `@basis/ui/theming`: the themes' inputs, the generator and `checkTheme`, for the gallery's theme studio, the one
 * tool outside the package that makes a theme. No app imports it: an app's themes are the library's, chosen by its
 * user, and declares no tokens. */

export { checkTheme, type ThemeProblem } from "#theme/check.ts";
export { scopedThemeCss } from "#theme/css.ts";
export {
  defineTheme,
  type ChartColour,
  type Charts,
  type ControlSize,
  type ControlSizeName,
  type Hue,
  type HueName,
  type Ink,
  type Mode,
  type Shade,
  type Step,
  type StepTone,
  type Surfaces,
  type ThemeInputs,
} from "#theme/inputs.ts";
export { themeFile } from "#theme/theme-file.ts";
export { defaultTheme, themes } from "#theme/themes/index.ts";
