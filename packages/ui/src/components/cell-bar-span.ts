/* Where a CellBar's bar runs, worked out without the DOM so that tests can check it. */

/** The bar's box: a hundred units across, which the SVG stretches to the cell. */
const across = 100;
const half = across / 2;

/** Where the bar starts and how wide it is, in the box's hundred units: from the left, or from the middle when signed,
 * none for a value that is not a number or a column whose largest magnitude is zero. */
function barSpan(
  value: number,
  max: number,
  signed: boolean,
): { readonly x: number; readonly width: number } {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return { width: 0, x: 0 };
  }
  const share = Math.min(1, Math.abs(value) / max);
  if (!signed) {
    return { width: share * across, x: 0 };
  }
  const width = share * half;
  return { width, x: value < 0 ? half - width : half };
}

export { across, barSpan, half };
