/* What the navigation and layout page's tests share: the compact density, an element's size, a wide window, and the
 * sidebar's cookie. */

import { page } from "vite-plus/test/browser";

/** WCAG 2.2's minimum target, in CSS pixels. */
const minimumTarget = 24;
/** A desktop's window, above the `md` breakpoint, and a phone's, below it. */
const desktop = { height: 800, width: 1280 } as const;
const phone = { height: 800, width: 414 } as const;

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

/** Whether the element is at least 24 px across both ways, WCAG 2.2's minimum target. */
function isTarget(element: Element): boolean {
  const [width, height] = sizeOf(element);
  return width >= minimumTarget && height >= minimumTarget;
}

/** Every element `selector` matches inside `root`, failing the test when there is none. */
function all(root: ParentNode, selector: string): readonly HTMLElement[] {
  const elements = [...root.querySelectorAll<HTMLElement>(selector)];
  if (elements.length === 0) {
    throw new Error(`Nothing matches ${selector}.`);
  }
  return elements;
}

/** The one element `selector` matches inside `root`, failing the test when there is none. */
function only(root: ParentNode, selector: string): HTMLElement {
  const [element] = all(root, selector);
  if (element === undefined) {
    throw new Error(`Nothing matches ${selector}.`);
  }
  return element;
}

/** Makes the window as wide as a desktop's, above the `md` breakpoint where the sidebar is a sheet. */
async function atDesktopWidth(): Promise<void> {
  await page.viewport(desktop.width, desktop.height);
}

/** Makes the window as narrow as a phone's, below the `md` breakpoint. */
async function atPhoneWidth(): Promise<void> {
  await page.viewport(phone.width, phone.height);
}

/** Forgets the sidebar's stored state, so each test starts from `defaultOpen`. */
async function forgetSidebar(): Promise<void> {
  await cookieStore.delete("basis-ui-sidebar");
}

/** The sidebar's cookie as `document.cookie` holds it, or `undefined`. */
function sidebarCookie(): string | undefined {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("basis-ui-sidebar="));
}

export {
  all,
  atDesktopWidth,
  atPhoneWidth,
  forgetSidebar,
  inCompactDensity,
  isTarget,
  only,
  sidebarCookie,
  sizeOf,
};
