/* WCAG 2's contrast ratio between two of the theme's colours. The browser converts each token to linear sRGB, through
 * CSS's relative colour syntax, so the page reads the colour it draws rather than parsing OKLCH itself; WCAG's
 * luminance is a weighted sum of the linear channels. */

/** WCAG 2's luminance weights for linear red, green and blue. */
const redWeight = 0.2126;
const greenWeight = 0.7152;
const blueWeight = 0.0722;
/** The flare WCAG 2 adds to both sides of the ratio. */
const flare = 0.05;

/** The CSS colour that is `token` in linear sRGB, which the browser computes as `color(srgb-linear R G B)`. */
function linearColour(token: string): string {
  return `color(from var(--${token}) srgb-linear r g b)`;
}

const linearPattern =
  /^color\(srgb-linear (?<red>[-\d.e]+) (?<green>[-\d.e]+) (?<blue>[-\d.e]+)(?: \/ [\d.]+)?\)$/u;

/** A channel, kept within sRGB's gamut, as a display shows it. */
function clamp(value: string | undefined): number {
  return Math.min(1, Math.max(0, Number(value)));
}

/** The luminance of a colour the browser computed as `color(srgb-linear R G B)`, or `undefined` for anything else, as
 * in a Node DOM, which computes no colours. */
function luminance(computed: string): number | undefined {
  const channels = linearPattern.exec(computed.trim())?.groups;
  if (channels === undefined) {
    return undefined;
  }
  return (
    redWeight * clamp(channels["red"]) +
    greenWeight * clamp(channels["green"]) +
    blueWeight * clamp(channels["blue"])
  );
}

/** The contrast ratio of two luminances, from 1 to 21, either way round; `undefined` if either is unknown. */
function contrastRatio(one: number | undefined, other: number | undefined): number | undefined {
  if (one === undefined || other === undefined) {
    return undefined;
  }
  return (Math.max(one, other) + flare) / (Math.min(one, other) + flare);
}

export { contrastRatio, linearColour, luminance };
