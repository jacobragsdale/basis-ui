/* What the feedback and display family's tests share: reading a token's computed colour, and running a check in the
 * compact density or with reduced motion. */

/** A colour as the browser computes it, such as `var(--success-subtle)`, so it compares with a computed style. */
function computedColour(value: string): string {
  const probe = document.createElement("div");
  probe.style.color = value;
  document.body.append(probe);
  const { color } = getComputedStyle(probe);
  probe.remove();
  return color;
}

/** Runs `check` with the page in the compact density, then puts the comfortable density back. */
async function inCompactDensity(check: () => Promise<void>): Promise<void> {
  document.documentElement.dataset["density"] = "compact";
  try {
    await check();
  } finally {
    delete document.documentElement.dataset["density"];
  }
}

/** Runs `check` as if the user had asked for reduced motion. Vitest's browser mode cannot emulate the media feature,
 * so this appends a copy of the page's styles in which every `prefers-reduced-motion: reduce` condition is one that
 * always holds, then removes it. */
function withReducedMotion(check: () => void): void {
  const css = [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText))
    .join("\n");
  const reduced = document.createElement("style");
  reduced.textContent = css.replaceAll("prefers-reduced-motion: reduce", "min-width: 0px");
  document.head.append(reduced);
  try {
    check();
  } finally {
    reduced.remove();
  }
}

/** A computed length in pixels, such as `"16px"`, as a number. */
function pixels(length: string): number {
  return Number(length.replace(/px$/u, ""));
}

export { computedColour, inCompactDensity, pixels, withReducedMotion };
