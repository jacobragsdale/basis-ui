// Holds @basis/ui's class strings to the theme's tokens: a colour comes whole from a token, never by fading one with an
// opacity modifier, and a focus ring takes its width from the theme. A colour faded by opacity changes with whatever
// lies under it, so no contrast check can measure it, and no theme can re-skin it.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "vite-plus/test";

import { tokenNames } from "#theme/tokens.ts";

const source = new URL("../src/", import.meta.url).pathname;

const files = readdirSync(source, { encoding: "utf8", recursive: true }).filter((file) =>
  /\.tsx?$/u.test(file),
);

/** Every utility that takes a colour, which an opacity modifier could fade. */
const colourUtilities = [
  "bg",
  "text",
  "border",
  "border-[trblxyse]",
  "ring",
  "ring-offset",
  "inset-ring",
  "outline",
  "shadow",
  "inset-shadow",
  "drop-shadow",
  "divide",
  "decoration",
  "caret",
  "accent",
  "fill",
  "stroke",
  "from",
  "via",
  "to",
];

const colours = [...tokenNames, "current", "transparent", "inherit"].toSorted(
  (one, other) => other.length - one.length,
);

const faded = new RegExp(
  String.raw`(?<![\w-])(?:${colourUtilities.join("|")})-(?:${colours.join("|")})/[^\s"'\u0060]+`,
  "gu",
);

/** A focus ring drawn with a width of its own, such as `focus-visible:ring-3`, rather than the theme's. `0` turns a
 * ring off, which a control inside a field label does when the label draws the ring. */
const focusWidth = /[^\s"'`]*focus[^\s"'`]*:(?:ring|outline)-(?!0\b)\d+\b/gu;

function matches(pattern: RegExp): readonly string[] {
  return files.flatMap((file) =>
    [...readFileSync(path.join(source, file), "utf8").matchAll(pattern)].map(
      ([match]) => `${file}: ${match}`,
    ),
  );
}

test("no colour class in @basis/ui takes an opacity modifier: a hovered fill, an edge or a veil is a token", () => {
  expect(matches(faded)).toEqual([]);
});

test("every focus ring takes its width from the theme's --focus-width", () => {
  expect(matches(focusWidth)).toEqual([]);
});

test("the checks find what they look for", () => {
  const sample =
    "hover:bg-primary/80 ring-edge/10 focus-visible:ring-3 w-1/2 text-sm/6 group-has-[:focus-visible]/x:ring-0";
  expect(sample.match(faded)).toEqual(["bg-primary/80", "ring-edge/10"]);
  expect(sample.match(focusWidth)).toEqual(["focus-visible:ring-3"]);
});
