/* Lets `style` set CSS variables, the one thing `shadcn/no-inline-styles` lets it set, as in
 * `style={{ "--fill": "40%" }}` read by a class such as `w-(--fill)`. React's `CSSProperties` names only CSS
 * properties, so TypeScript rejects a variable (TS2353) until it is widened here. `@basis/ui`'s entry point exports
 * this module's type, so every app that imports a component gets the widening with it. */

/** A CSS custom property's name, such as `--fill`. */
type CssVariable = `--${string}`;

declare module "react" {
  interface CSSProperties {
    // oxlint-disable-next-line typescript/consistent-indexed-object-style -- merging into React's interface needs an index signature; a Record type cannot merge.
    [variable: CssVariable]: string | number | undefined;
  }
}

export type { CssVariable };
