/* Each density draws its controls in whole pixels. Every control on the gallery's pages, in compact and in comfortable,
 * has a whole-pixel height, horizontal padding, gap and icon size; Button's sizes are each a different height; and an
 * icon or a check is not smaller than the text beside it warrants.
 *
 * The rule for icons and checks: a glyph is at least as tall as the capitals of the text beside it. Lucide draws in 20
 * of its 24 units and Inter's capitals are 0.727 em tall, so an icon's box, or a check's, is at least 0.873 em: 13
 * pixels beside 14-pixel text and 11 beside 12. The compact density's 12-pixel icons and checks beside 14-pixel text
 * drew glyphs 10 pixels tall beside capitals of 10.2. */

import "#styles.css";

import { Button, PlusIcon } from "@basis/ui";
import type { Density } from "@basis/ui";
import { cleanup, render } from "vitest-browser-react";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { Gallery } from "./gallery.tsx";
import { pages } from "./pages.ts";
import type { GalleryPage } from "./pages.ts";

const densities: readonly Density[] = ["compact", "comfortable"];

/** The pages whose sections hold controls. */
const withControls = pages.filter((page) => page.id !== "tokens" && page.id !== "icons");

/** What counts as a control: what a user presses, types in or checks. */
const controls = [
  "button",
  "[data-slot=button]",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "[role=combobox]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=switch]",
  "[role=tab]",
  "[role=menuitem]",
  "[role=menuitemcheckbox]",
  "[role=menuitemradio]",
  "[role=option]",
  "[data-slot=badge]",
  "[data-slot=toggle]",
].join(", ");

/** How far from a whole pixel a length may be, for the browser's float arithmetic. */
const tolerance = 0.01;

/** Inter's capitals are 0.727 em tall, and lucide draws in 20 of its 24 units, so an icon box of 0.873 em draws a glyph
 * as tall as the capitals beside it. */
const capHeight = 0.727;
const drawn = 20 / 24;
const smallestIcon = capHeight / drawn;

function whole(value: number): boolean {
  return Math.abs(value - Math.round(value)) < tolerance;
}

/** A computed length, such as `7.5px`, in pixels. */
function pixels(value: string): number {
  return Number(value.replace(/px$/u, ""));
}

/** A name for a control in a failure: its slot or role, its size, and its text. */
function nameOf(element: HTMLElement): string {
  const { size, slot = element.getAttribute("role") ?? element.tagName } = element.dataset;
  const text = (element.textContent ?? "").trim().slice(0, 24);
  return `${slot}${size === undefined ? "" : `[${size}]`} "${text}"`;
}

/** Whether an element shows text of its own, rather than only an icon and a name for screen readers. */
function hasText(element: Element): boolean {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (
      (node.textContent ?? "").trim() !== "" &&
      parent !== null &&
      parent.getBoundingClientRect().width > 1
    ) {
      return true;
    }
  }
  return false;
}

/** The font size of the text beside a check or a radio: its label's. */
function labelSizeOf(element: HTMLElement): number {
  const label =
    element.closest("label") ??
    (element.id === "" ? null : document.querySelector(`label[for="${element.id}"]`)) ??
    element.parentElement?.querySelector("label") ??
    element.parentElement ??
    element;
  return pixels(getComputedStyle(label).fontSize);
}

/** What is wrong with a control's own lengths: its height, its horizontal padding and its gap. */
function lengthProblems(element: HTMLElement, name: string): string[] {
  const style = getComputedStyle(element);
  const { height } = element.getBoundingClientRect();
  const lengths = [
    ["height", String(height)],
    ["paddingLeft", style.paddingLeft],
    ["paddingRight", style.paddingRight],
    ["gap", style.columnGap === "normal" ? "0" : style.columnGap],
  ] as const;
  return lengths
    .filter(([, value]) => !whole(pixels(value)))
    .map(([length, value]) => `${name} has a ${length} of ${value}`);
}

/** What is wrong with a check's or a radio's box, which the 24-pixel target draws as its first child. */
function boxProblems(element: HTMLElement, name: string): string[] {
  const box = element.firstElementChild?.getBoundingClientRect();
  const text = labelSizeOf(element);
  if (box === undefined || (whole(box.height) && box.height >= smallestIcon * text)) {
    return [];
  }
  return [`${name}'s box is ${String(box.height)} px beside ${String(text)} px text`];
}

/** What is wrong with a control's icons: each is whole pixels, at its laid-out size, which a spinner's turning leaves
 * alone, and no shorter than the control's text, if it has any, warrants. */
function iconProblems(element: HTMLElement, name: string): string[] {
  const fontSize = pixels(getComputedStyle(element).fontSize);
  const smallest = hasText(element) ? smallestIcon * fontSize : 0;
  return [...element.querySelectorAll<SVGElement>(":scope > svg, :scope > * > svg")].flatMap(
    (icon) => {
      const style = getComputedStyle(icon);
      const [width, height] = [pixels(style.width), pixels(style.height)];
      if (Number.isNaN(height) || height === 0) {
        return [];
      }
      if (!whole(height) || !whole(width)) {
        return [`${name}'s icon is ${String(width)} by ${String(height)} px`];
      }
      return height < smallest
        ? [`${name}'s icon is ${String(height)} px beside ${String(fontSize)} px text`]
        : [];
    },
  );
}

/** What is wrong with one control, as lines; none when it is right, or not shown. */
function problems(element: HTMLElement): string[] {
  const { width, height } = element.getBoundingClientRect();
  if (width === 0 || height === 0) {
    return [];
  }
  const name = nameOf(element);
  const role = element.getAttribute("role");
  const drawnProblems =
    role === "checkbox" || role === "radio"
      ? boxProblems(element, name)
      : iconProblems(element, name);
  return [...lengthProblems(element, name), ...drawnProblems];
}

/** Lets the page's effects and timers run, and its popups open. */
async function settle(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  setTimeout(resolve, 50);
  await promise;
}

/** What is wrong with the controls of a page, or of one of its sections shown alone, as its screenshot shows it, with
 * its menus and popups open; and the ids of the sections it shows. */
async function check(
  page: GalleryPage,
  density: Density,
  section: string | null,
): Promise<readonly [readonly string[], readonly string[]]> {
  const query = new URLSearchParams({ density, mode: "light", page: page.id });
  await render(
    <Gallery
      page={page}
      search={`?${query.toString()}`}
      mode="light"
      density={density}
      theme="default"
      section={section}
    />,
  );
  await settle();
  const where = section ?? page.id;
  const found = [...document.body.querySelectorAll<HTMLElement>(controls)]
    .flatMap((element) => problems(element))
    .map((problem) => `${where}: ${problem}`);
  const sections = [...document.querySelectorAll<HTMLElement>("[data-shot]")].map(
    (element) => element.dataset["shot"] ?? "",
  );
  await cleanup();
  return [found, sections];
}

/** Each section's problems, one section at a time. */
async function inTurn(
  page: GalleryPage,
  density: Density,
  sections: readonly string[],
): Promise<readonly string[]> {
  const [section, ...rest] = sections;
  if (section === undefined) {
    return [];
  }
  const [found] = await check(page, density, section);
  return [...found, ...(await inTurn(page, density, rest))];
}

/** Button's heights, `xs`, `sm`, the default and `lg`, in each density. */
const buttonHeights = {
  comfortable: [24, 28, 32, 36],
  compact: [24, 26, 28, 30],
} as const satisfies Record<Density, readonly number[]>;

afterEach(async () => {
  await cleanup();
  document.documentElement.dataset["density"] = "comfortable";
});

describe.each(densities)("in the %s density", (density) => {
  test.each(withControls)(
    "every control on $title, and in each of its sections shown alone, is drawn in whole pixels",
    async (page) => {
      document.documentElement.dataset["density"] = density;
      const [found, sections] = await check(page, density, null);
      const alone = await inTurn(page, density, sections);
      expect([...new Set([...found, ...alone])]).toStrictEqual([]);
    },
  );

  test("Button's sizes are each a different height, whatever their icons", async () => {
    document.documentElement.dataset["density"] = density;
    const sizes = ["xs", "sm", "default", "lg"] as const;
    const screen = await render(
      <>
        {sizes.map((size) => (
          <Button key={size} size={size}>
            <PlusIcon data-icon="inline-start" />
            {size}
          </Button>
        ))}
      </>,
    );
    const heights = sizes.map(
      (size) => screen.getByRole("button", { name: size }).element().getBoundingClientRect().height,
    );
    expect(heights).toStrictEqual(buttonHeights[density]);
    expect(new Set(heights).size).toBe(sizes.length);
  });
});
