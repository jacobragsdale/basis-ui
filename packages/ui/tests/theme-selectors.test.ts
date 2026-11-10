/* A theme combines with the mode's class and the density wherever each sits: on the page's root, or on a wrapper, in
 * either order. The cascade is happy-dom's, which weighs selectors as a browser does. */

import { Window } from "happy-dom";
import type { CSSStyleDeclaration as PageStyle, Element as PageElement } from "happy-dom";
import { describe, expect, test } from "vite-plus/test";

import { themeBlocks } from "#theme/css.ts";
import type { Mode, ThemeInputs } from "#theme/inputs.ts";
import type { Density } from "#theme/preferences.ts";
import { defaultTheme } from "#theme/themes/index.ts";

import { dummy, valueOf } from "./theme-dummies.ts";

const sea = dummy("sea", 200);
const moss = dummy("moss", 120);

/** A page with the themes' rules, `root`'s attributes on `<html>` and `body` in `<body>`, and the element under test:
 * the one with `id="probe"`, or `<html>` when none has it. */
function probe(root: Readonly<Record<string, string>>, body: string): PageStyle {
  const window = new Window();
  const { document } = window;
  const style = document.createElement("style");
  style.textContent = themeBlocks([defaultTheme, sea, moss]);
  document.head.append(style);
  for (const [name, value] of Object.entries(root)) {
    document.documentElement.setAttribute(name, value);
  }
  document.body.innerHTML = body;
  const element: PageElement = document.querySelector("#probe") ?? document.documentElement;
  return window.getComputedStyle(element);
}

interface ModeCase {
  readonly name: string;
  readonly root: Readonly<Record<string, string>>;
  readonly body: string;
  readonly theme: ThemeInputs;
  readonly mode: Mode;
}

const modeCases: readonly ModeCase[] = [
  { body: "", mode: "light", name: "nothing set", root: {}, theme: defaultTheme },
  {
    body: "",
    mode: "dark",
    name: "dark on the root",
    root: { class: "dark" },
    theme: defaultTheme,
  },
  {
    body: "",
    mode: "light",
    name: "a theme on the root",
    root: { "data-theme": "sea" },
    theme: sea,
  },
  {
    body: "",
    mode: "dark",
    name: "a theme and dark on the root",
    root: { class: "dark", "data-theme": "sea" },
    theme: sea,
  },
  {
    body: '<div id="probe" data-theme="sea"></div>',
    mode: "dark",
    name: "a theme on a wrapper on a dark page",
    root: { class: "dark" },
    theme: sea,
  },
  {
    body: '<div id="probe" class="dark"></div>',
    mode: "dark",
    name: "a dark wrapper in a themed page",
    root: { "data-theme": "sea" },
    theme: sea,
  },
  {
    body: '<div id="probe" class="dark" data-theme="sea"></div>',
    mode: "dark",
    name: "a theme and dark on a wrapper",
    root: {},
    theme: sea,
  },
  {
    body: '<div data-theme="sea"><div id="probe" data-theme="moss"></div></div>',
    mode: "light",
    name: "a theme inside another",
    root: {},
    theme: moss,
  },
  {
    body: '<div data-theme="sea"><div id="probe" data-theme="moss"></div></div>',
    mode: "dark",
    name: "a theme inside another on a dark page",
    root: { class: "dark" },
    theme: moss,
  },
  {
    body: '<div id="probe" class="dark" data-theme="moss"></div>',
    mode: "dark",
    name: "a dark wrapper of one theme in a page of another",
    root: { "data-theme": "sea" },
    theme: moss,
  },
  {
    body: '<div id="probe" class="dark" data-theme="sea"></div>',
    mode: "dark",
    name: "a dark wrapper of one theme in a page of another written after it",
    root: { "data-theme": "moss" },
    theme: sea,
  },
];

describe("a theme and the mode", () => {
  test.each(modeCases)("$name: $theme.name in $mode mode", ({ body, mode, root, theme }) => {
    const style = probe(root, body);
    expect(style.getPropertyValue("color-scheme").trim()).toBe(mode);
    // The rules that set the mode's values match the element itself; happy-dom does not pass a variable down to an
    // element no rule matches, as a browser does.
    for (const name of ["--primary", "--background", "--shadow-raised"]) {
      expect(style.getPropertyValue(name).trim(), name).toBe(valueOf(theme, mode, name));
    }
  });
});

interface DensityCase {
  readonly name: string;
  readonly root: Readonly<Record<string, string>>;
  readonly body: string;
  readonly theme: ThemeInputs;
  readonly density: Density;
}

const densityCases: readonly DensityCase[] = [
  {
    body: "",
    density: "comfortable",
    name: "the default, comfortable",
    root: { "data-density": "comfortable" },
    theme: defaultTheme,
  },
  {
    body: "",
    density: "compact",
    name: "a theme on the root",
    root: { "data-theme": "sea" },
    theme: sea,
  },
  {
    body: "",
    density: "comfortable",
    name: "a theme on the root, comfortable",
    root: { "data-density": "comfortable", "data-theme": "sea" },
    theme: sea,
  },
  {
    body: '<div id="probe" data-theme="sea"></div>',
    density: "comfortable",
    name: "a theme on a wrapper, comfortable",
    root: { "data-density": "comfortable" },
    theme: sea,
  },
  {
    body: "",
    density: "comfortable",
    name: "a theme and dark on the root, comfortable",
    root: { class: "dark", "data-density": "comfortable", "data-theme": "sea" },
    theme: sea,
  },
];

describe("a theme and the density", () => {
  test.each(densityCases)("$name: $theme.name, $density", ({ body, density, root, theme }) => {
    const style = probe(root, body);
    expect(style.getPropertyValue("--control-md-height").trim()).toBe(
      `${String(theme.controls[density].md.height / 16)}rem`,
    );
    expect(style.getPropertyValue("--spacing").trim()).toBe(theme.spacing[density]);
  });
});
