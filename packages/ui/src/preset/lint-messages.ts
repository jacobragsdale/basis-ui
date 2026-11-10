/* The words of @shadcn/lint's errors in an app, set through the rules' `message` and `contracts` options, since its
 * own name a path inside @basis/ui, suggest the chart colour nearest in hue, call a missing shadow a colour, and tell
 * an app to declare a class, a colour or a CSS rule in its stylesheet, which the drift check holds to @basis/ui's
 * (docs/design.md, The toolchain, at its strictest). `no-restyle` names each component's variants from the
 * catalogue @basis/ui ships, and the command that shows them. lint.ts applies them. */

import { readFileSync } from "node:fs";

import { catalogueSchema } from "#catalogue/format.ts";
import type { CatalogueComponent } from "#catalogue/format.ts";

/** "a, b or c", for the options an error offers. */
function either(options: readonly string[]): string {
  const last = options.at(-1) ?? "";
  return options.length < 2 ? last : `${options.slice(0, -1).join(", ")} or ${last}`;
}

const placement = "give className only margin, width, and flex or grid placement";

/** What `no-restyle` says for a class that restyles `component`, by what the class changes. */
function restyleMessage({ name, variants }: CatalogueComponent): Record<string, string> {
  const axes = Object.entries(variants).map(
    ([axis, { options }]) => `${axis} (${either(options)})`,
  );
  const look =
    axes.length === 0
      ? `ERROR "{{className}}" restyles ${name}, whose look is @basis/ui's and has no variants: ${placement}, and wrap it in a plain element for anything else; vp run docs ${name} shows it.`
      : `ERROR "{{className}}" restyles ${name}, whose look is its own: set ${either(axes)}, ${placement}, and run vp run docs ${name} to see each.`;
  return {
    default: `ERROR "{{className}}" on ${name} is no class @basis/ui's theme generates: fix its spelling, ${placement}, and run vp run docs ${name} for its look.`,
    color: look,
    effects: look,
    layout: look,
    motion: look,
    shape: look,
    spacing: look,
    typography: look,
  };
}

/** One contract a component, keeping the rule's allow and deny lists: its name, also as a bundle renames it, such as
 * `Button$1`, which is what the rule reads when @basis/ui is linked into a workspace rather than installed. */
function restyleContracts(): { message: Record<string, string>; pattern: string }[] {
  const text = readFileSync(new URL("../../catalogue.json", import.meta.url), "utf8");
  const { components } = catalogueSchema.parse(JSON.parse(text));
  return components.map((component) => ({
    message: restyleMessage(component),
    pattern: `^${component.name}(?:\\$\\d+)?$`,
  }));
}

/** For a component the catalogue does not hold. */
const restyleFallback = `ERROR "{{className}}" restyles <{{component}}>, whose look is its own: set its variant or size, ${placement}, and run vp run docs {{component}} to see them.`;

/* A colour or shadow outside the theme: palette colours, hex values, and the shadows and drop shadows the theme
 * removes, which Tailwind would read as colours. Suggestions by hue offered a diverging scale's ninth step for red. */
const rawColour =
  "ERROR \"{{className}}\" is not a colour or shadow of @basis/ui's theme, whose tokens follow the user's theme and mode: name a colour by what it means, as text-loss or bg-destructive for red, text-gain or bg-success for green, bg-warning for amber, bg-info or bg-primary for blue, text-muted-foreground, bg-muted or border-edge for grey, and text-foreground or bg-background for black and white; a status is a Badge or Alert variant, and a shadow shadow-sm or shadow-md.";

/* A class Tailwind does not generate. @shadcn/lint's own words send an app to declare it with `@utility` or
 * `@custom-variant` in src/styles.css; the suggestion, when it has one, is a class of the theme's. */
const unknownClass =
  "ERROR \"{{className}}\" is no class or variant @basis/ui's theme generates, and an app declares none of its own: fix its spelling (closest: {{suggestion|none}}), or take the look from a component's variant or a theme token, which vp run docs --search WORDS finds.";

/* A value off the theme's scales. @shadcn/lint's own words send a colour to be declared in src/styles.css. */
const arbitraryValue =
  "ERROR \"{{className}}\" is a value off @basis/ui's theme, and an app declares no tokens or scales of its own: use {{suggestions|the theme's nearest step or token}} instead, and for a colour the token named by its meaning, as text-loss for red or bg-muted for grey.";

/* A style that sets more than a CSS variable. @shadcn/lint's own words send a `<style>` element's rule to the
 * stylesheet. */
const inlineStyle =
  "ERROR this style sets {{property|CSS of its own}} outside @basis/ui's theme: a style may set only a CSS variable that a class reads, as --fill read by w-(--fill), to a size and never a colour, and every other look comes from a component's variant or a theme token.";

export { arbitraryValue, inlineStyle, rawColour, restyleContracts, restyleFallback, unknownClass };
