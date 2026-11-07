/* The ink that reads on a colour: white or near-black, by contrast with the colour's luminance, for labels painted
 * on bars and slices. */

/** The largest value of one channel written in hexadecimal. */
const channelMax = 255;
const hexadecimal = 16;
/** sRGB's transfer function: the linear segment's end, its slope, and the curve's offset, scale and power. */
const linearEnd = 0.04045;
const linearSlope = 12.92;
const curveOffset = 0.055;
const curveScale = 1.055;
const curvePower = 2.4;
/** Rec. 709's weights of the red, green and blue channels in luminance. */
const redWeight = 0.2126;
const greenWeight = 0.7152;
const blueWeight = 0.0722;
/** The flare WCAG's contrast ratio adds to each luminance, and white's luminance with it. */
const flare = 0.05;
const whiteWithFlare = 1.05;

/** Near-black text, whose luminance `inkOn` compares with white's. */
const darkInk = "#111827";
const darkInkLuminance = 0.0092;

/** The three forms of colour whose channels `luminance` reads. */
const hexColor = /^#(?<red>[0-9a-f]{2})(?<green>[0-9a-f]{2})(?<blue>[0-9a-f]{2})/iu;
const rgbColor = /^rgba?\(\s*(?<red>[\d.]+)[,\s]+(?<green>[\d.]+)[,\s]+(?<blue>[\d.]+)/iu;
const srgbColor = /^color\(srgb\s+(?<red>[\d.]+)\s+(?<green>[\d.]+)\s+(?<blue>[\d.]+)/iu;

/** A match's red, green and blue, as written. */
function partsOf(
  groups: Readonly<Record<string, string | undefined>>,
): readonly (string | undefined)[] {
  return [groups["red"], groups["green"], groups["blue"]];
}

/** A colour's channels from 0 to 1, from `#rrggbb`, `rgb()`, `rgba()` or `color(srgb …)`; null for any other form. */
function channelsOf(color: string): readonly number[] | null {
  const hex = hexColor.exec(color)?.groups;
  if (hex !== undefined) {
    return partsOf(hex).map((part) => Number.parseInt(part ?? "0", hexadecimal) / channelMax);
  }
  const rgb = rgbColor.exec(color)?.groups;
  if (rgb !== undefined) {
    return partsOf(rgb).map((part) => Number(part) / channelMax);
  }
  const srgb = srgbColor.exec(color)?.groups;
  return srgb === undefined ? null : partsOf(srgb).map(Number);
}

/** A colour's relative luminance, from `rgb()`, `rgba()`, `#rrggbb` or `color(srgb …)`; null if it is none of those. */
function luminance(color: string): number | null {
  const channels = channelsOf(color);
  if (channels === null) {
    return null;
  }
  const [red, green, blue] = channels.map((part) =>
    part <= linearEnd ? part / linearSlope : ((part + curveOffset) / curveScale) ** curvePower,
  );
  return redWeight * (red ?? 0) + greenWeight * (green ?? 0) + blueWeight * (blue ?? 0);
}

/** White or near-black, whichever has the higher contrast with `color`; white if `color` can't be read. */
function inkOn(color: string): string {
  const shade = luminance(color);
  return shade === null ||
    whiteWithFlare / (shade + flare) >= (shade + flare) / (darkInkLuminance + flare)
    ? "#ffffff"
    : darkInk;
}

export { inkOn, luminance };
