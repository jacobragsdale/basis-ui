/* The words of @shadcn/lint's errors in an app, set through the rules' `message` and `contracts` options, since its
 * own name a path inside @basis/ui, suggest the chart colour nearest in hue, and call a missing shadow a colour
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
  "ERROR \"{{className}}\" is not a colour or shadow of @basis/ui's theme, whose tokens follow the user's theme and mode: name a colour by what it means, as text-loss or bg-destructive for red, text-gain or bg-success for green, bg-warning for amber, bg-info or bg-primary for blue, and text-muted-foreground, bg-muted or border-edge for grey; a status is a Badge or Alert variant, and a shadow shadow-sm or shadow-md.";

export { rawColour, restyleContracts, restyleFallback };
