/* The gallery's visual and accessibility checks, as the maintainer cut them on 2026-11-11: a small set of whole-page
 * screenshots, a few busy pages in the default theme, light and dark, and one page in each other theme, compared pixel
 * for pixel with those in `screenshots/`; and the axe check on every section of every page, alone, with its overlays
 * open and its hovered, focused and pressed examples, marked with `data-pictured`, forced through Chromium's DevTools
 * protocol, in the default theme, light and dark, at the compact density, recording no picture. `checkTheme` is the
 * check that every theme passes; a new component, state or feature is proved by unit and DOM tests, not a baseline.
 *
 * Text renders differently from one machine to the next, so these run only in the pinned Playwright image: run them
 * with `vp run @basis/gallery#shots`, and record the baselines again with `--update`. */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { expect, test } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";
import type axeCore from "axe-core";
import type { RunOptions } from "axe-core";

import { expectedErrors, pageIds, themeIds } from "#manifest.ts";
import type { PageId, ThemeId } from "#manifest.ts";
import { axeOptions } from "./axe.ts";
import server from "./server.json" with { type: "json" };

declare global {
  interface Window {
    /** axe-core, once its script is added to the page. */
    readonly axe: typeof axeCore;
  }
}

test.skip(
  process.env["GALLERY_PINNED_IMAGE"] !== "1",
  "Screenshots are compared only in the pinned Playwright image: run vp run @basis/gallery#shots.",
);

type Mode = "light" | "dark";
type Density = "comfortable" | "compact";

const modes: readonly Mode[] = ["light", "dark"];

/** The time the page's clock is held at: a Friday afternoon in New York, after the close. */
const now = new Date("2026-11-06T21:30:00Z");

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);

/** In the pinned image drawing is deterministic, so every pixel must match: the default tolerance misses a light
 * wash. */
const exactly = { animations: "disabled", caret: "hide", maxDiffPixels: 0, threshold: 0 } as const;

/** The pseudo-classes a `data-pictured` value may force. `open` is not one: it asks for its trigger to be opened. */
const pseudoClasses = new Set(["hover", "focus", "focus-visible", "focus-within", "active"]);

/** Runs `step` on each item in turn, each once the one before has finished. */
async function inTurn<TItem>(
  items: readonly TItem[],
  step: (item: TItem) => Promise<void>,
  index = 0,
): Promise<void> {
  const item = items[index];
  if (item === undefined) {
    return;
  }
  await step(item);
  await inTurn(items, step, index + 1);
}

interface View {
  readonly id: PageId;
  readonly theme: ThemeId;
  readonly mode: Mode;
  readonly density: Density;
  readonly section?: string;
}

/** Opens a gallery page in a theme, mode and density, stored as @basis/ui's cookie holds them for every app and named in the
 * query, as a screenshot opens it. */
async function open(page: Page, { id, theme, mode, density, section }: View): Promise<void> {
  await page
    .context()
    .addCookies([
      { name: "basis-ui-preferences", url: server.url, value: `${mode}.${density}.full.${theme}` },
    ]);
  const query = new URLSearchParams({ density, mode, page: id, theme });
  if (section !== undefined) {
    query.set("section", section);
  }
  await page.goto(`/?${query.toString()}`);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/** Two animation frames, for a paint to reach the screen. */
async function frames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { promise, resolve } = Promise.withResolvers<number>();
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
    await promise;
  });
}

/** Waits until every animation that ends has ended, as a popup's opening does; a spinner's never does. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getComputedTiming().endTime === Number.POSITIVE_INFINITY,
      ),
  );
  await frames(page);
}

/**
 * Paints the whole page again. A rounded corner painted while the page was still settling can come out a shade
 * different from one painted whole, so a screenshot taken straight away would depend on when it settled. The page
 * turns transparent rather than hidden for a moment, since a hidden element would lose focus.
 */
async function paintAfresh(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.style.opacity = "0";
  });
  await frames(page);
  await page.evaluate(() => {
    document.documentElement.style.opacity = "";
  });
  await frames(page);
}

/** Opens what each `data-pictured="open"` example holds by keyboard, pressing its `data-pictured-key` on the first
 * button inside, for a component whose open state no prop sets. */
async function openByKeyboard(page: Page): Promise<void> {
  const triggers = await page.locator('[data-pictured~="open"]').all();
  await inTurn(triggers, async (trigger) => {
    const key = (await trigger.getAttribute("data-pictured-key")) ?? "Enter";
    const button = trigger.getByRole("button").first();
    await button.focus();
    await button.press(key);
  });
}

/** Forces each pseudo-class a `data-pictured` attribute names on its element, through a DevTools session that must
 * stay open while the screenshot is taken. */
async function forceStates(page: Page): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  const { root } = await session.send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await session.send("DOM.querySelectorAll", {
    nodeId: root.nodeId,
    selector: "[data-pictured]",
  });
  await Promise.all(
    nodeIds.map(async (nodeId) => {
      const { attributes } = await session.send("DOM.getAttributes", { nodeId });
      const value = attributes[attributes.indexOf("data-pictured") + 1] ?? "";
      const forcedPseudoClasses = value.split(" ").filter((state) => pseudoClasses.has(state));
      await session.send("CSS.forcePseudoState", { forcedPseudoClasses, nodeId });
    }),
  );
  return session;
}

/** Axe's violations on the page, which shows one section alone, one line per element at fault. */
async function violations(page: Page, section: string): Promise<string[]> {
  await page.addScriptTag({ content: axeSource });
  const found = await page.evaluate(async (options: RunOptions) => {
    const results = await globalThis.window.axe.run(document, options);
    return results.violations.flatMap((violation) =>
      violation.nodes.map((node) => ({
        help: violation.help,
        rule: violation.id,
        target: node.target.join(" "),
      })),
    );
  }, axeOptions(section));
  return found.map(({ help, rule, target }) => `${section}: ${rule} (${help}) at ${target}`);
}

/** Opens a section alone as its screenshot pictures it: its overlays open, the pointer out of the way, its states
 * forced, and the page settled and painted afresh. The session it returns keeps the states forced until detached. */
async function picture(page: Page, view: View): Promise<CDPSession> {
  await open(page, view);
  await openByKeyboard(page);
  await page.mouse.move(0, 0);
  await settled(page);
  const session = await forceStates(page);
  // A forced hover or focus starts the control's transition, which must end before the page is painted afresh.
  await settled(page);
  await paintAfresh(page);
  return session;
}

/** Checks one section alone with axe, as its screenshot used to picture it. Soft, so one run lists every section that
 * fails. */
async function check(page: Page, view: View & { readonly section: string }): Promise<void> {
  const session = await picture(page, view);
  expect.soft(await violations(page, view.section), `axe on ${view.section}`).toStrictEqual([]);
  await session.detach();
}

/** Collects the errors a page logs, which a test holds to the ones it logs on purpose. */
function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  return errors;
}

/** The pages compared whole, each in one theme and mode, at the compact density: the busiest pages in the default
 * theme, light and dark, the theme's tokens, and one page in each other theme. */
const baselines: readonly Omit<View, "density" | "section">[] = [
  ...(["light", "dark"] as const).flatMap((mode) =>
    (["forms-and-inputs", "data", "feedback-and-display", "app-in-shell"] as const).map((id) => ({
      id,
      mode,
      theme: themeIds[0],
    })),
  ),
  { id: "tokens", mode: "light", theme: themeIds[0] },
  { id: "data", mode: "dark", theme: "desk" },
  { id: "forms-and-inputs", mode: "light", theme: "high-contrast" },
];

for (const view of baselines) {
  // The default theme's screenshots carry no theme in their names, as `vp run shot` names them.
  const theme = view.theme === themeIds[0] ? "" : `-${view.theme}`;
  test(`${view.id} draws as in its screenshot, ${view.theme}, ${view.mode}`, async ({ page }) => {
    await page.clock.setFixedTime(now);
    await open(page, { ...view, density: "compact" });
    await page.mouse.move(0, 0);
    await settled(page);
    await paintAfresh(page);
    await expect(page).toHaveScreenshot(`${view.id}-${view.mode}${theme}.png`, {
      ...exactly,
      fullPage: true,
    });
  });
}

for (const id of pageIds) {
  for (const mode of modes) {
    test(`${id}: axe on every section, ${mode}`, async ({ page }) => {
      const errors = errorsOf(page);
      await page.clock.setFixedTime(now);
      const view = { density: "compact", id, mode, theme: themeIds[0] } as const;
      await open(page, view);
      const sections = await page
        .locator("[data-shot]")
        .evaluateAll((elements) =>
          elements.map((element) =>
            element instanceof HTMLElement ? (element.dataset["shot"] ?? "") : "",
          ),
        );
      expect(sections.length, `the sections on ${id}`).toBeGreaterThan(0);
      await inTurn(sections, async (section) => {
        await check(page, { ...view, section });
      });
      const unexpected = errors.filter(
        (error) => !expectedErrors.some((expected) => expected.test(error)),
      );
      expect(unexpected, `errors on ${id}`).toStrictEqual([]);
    });
  }
}
