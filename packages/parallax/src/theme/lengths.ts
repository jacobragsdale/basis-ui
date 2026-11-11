/* Reading a token's length, as `getComputedStyle` gives a registered length: a number of pixels, such as `24px`. */

/** The number a CSS value starts with, such as 24 for `24px` or 50 for `50%`. */
const leading = /^\s*(?<number>[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/iu;

/** The number a CSS value starts with; NaN for none. */
function leadingNumber(value: string): number {
  const number = leading.exec(value)?.groups?.["number"];
  return number === undefined ? Number.NaN : Number(number);
}

/** A length token in pixels, or `otherwise` if it is not one. */
function pixels(value: string, otherwise: number): number {
  const parsed = leadingNumber(value);
  return Number.isFinite(parsed) ? parsed : otherwise;
}

export { leadingNumber, pixels };
