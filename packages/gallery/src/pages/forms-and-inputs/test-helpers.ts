/* What the forms and inputs page's tests share: the compact density, an element's size, and the computed look that
 * tells one variant from another. */

/** Runs `check` with the page in the compact density, then puts the comfortable density back. */
async function inCompactDensity(check: () => Promise<void>): Promise<void> {
  document.documentElement.dataset["density"] = "compact";
  try {
    await check();
  } finally {
    delete document.documentElement.dataset["density"];
  }
}

/** An element's width and height in CSS pixels. */
function sizeOf(element: Element): readonly [number, number] {
  const box = element.getBoundingClientRect();
  return [box.width, box.height];
}

/** The computed look that tells one variant from another: its colours, border and height. */
function lookOf(element: Element): string {
  const style = getComputedStyle(element);
  return [
    style.backgroundColor,
    style.color,
    style.borderColor,
    style.borderTopWidth,
    style.height,
  ].join(" ");
}

/** A colour as the browser computes it, such as a token's `var(--destructive)`, so it compares with a computed style. */
function computedColour(value: string): string {
  const probe = document.createElement("div");
  probe.style.color = value;
  document.body.append(probe);
  const { color } = getComputedStyle(probe);
  probe.remove();
  return color;
}

/** The one element the selector matches inside `root`, failing the test when there is none. */
function only(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`Nothing matches ${selector}.`);
  }
  return element;
}

export { computedColour, inCompactDensity, lookOf, only, sizeOf };
