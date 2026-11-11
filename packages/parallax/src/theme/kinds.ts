/* The kinds of token, how each registers, and the helpers that write a token's defaults. */

/** The light or dark set of defaults; `auto` follows the system's preference. */
type Scheme = "light" | "dark" | "auto";

/** A scheme as drawn. */
type ResolvedScheme = Exclude<Scheme, "auto">;

/** How a token's value is registered: colours and lengths by their syntax, so they compute to concrete values. */
type Syntax = "color" | "length" | "family" | "weight";

/** The `@property` syntax each kind registers with, if any. */
const registeredSyntax: Readonly<Record<Syntax, string | null>> = {
  color: "<color>",
  family: null,
  length: "<length>",
  weight: null,
};

/**
 * One token: its property after `--px-`, its kind, and its default in each scheme. A default may be an expression of
 * other tokens, such as a `calc()`; `initial` is then the value it registers with, which must be a plain value.
 */
interface TokenSpec {
  readonly property: string;
  readonly syntax: Syntax;
  readonly light: string;
  readonly dark: string;
  readonly initial?: string;
}

/** A tint of one token over another, by a share in percent in each scheme. */
interface Tint {
  readonly of: string;
  readonly over: string;
  readonly light: number;
  readonly dark: number;
}

/** A default made from other tokens, and the plain value it registers with. */
interface Derivation {
  readonly value: string;
  readonly initial: string;
}

/** The value a host or a theme gives the token `property`, else `otherwise`: what a default derived from it reads. */
function given(property: string, otherwise: string): string {
  return `var(--px-${property}, var(--_px-theme-${property}, ${otherwise}))`;
}

/** `percent` of the token `of` over the token `over`, such as a tint of the foreground over the background. */
function mix(of: string, percent: number, over: string): string {
  const base = over === "transparent" ? over : `var(--_px-${over})`;
  return `color-mix(in srgb, var(--_px-${of}) ${String(percent)}%, ${base})`;
}

/** A token whose default is derived from others the same way in both schemes. */
function derived<TSyntax extends Syntax>(
  property: string,
  syntax: TSyntax,
  { value, initial }: Derivation,
): TokenSpec & { readonly syntax: TSyntax } {
  return { dark: value, initial, light: value, property, syntax };
}

/** A colour token tinted from others by a different amount in each scheme. */
function tinted(
  property: string,
  { of, over, light, dark }: Tint,
  initial: string,
): TokenSpec & { readonly syntax: "color" } {
  return {
    dark: mix(of, dark, over),
    initial,
    light: mix(of, light, over),
    property,
    syntax: "color",
  };
}

/** A token with one value in both schemes. */
function same<TSyntax extends Syntax>(
  property: string,
  syntax: TSyntax,
  value: string,
): TokenSpec & { readonly syntax: TSyntax } {
  return { dark: value, light: value, property, syntax };
}

export { derived, given, registeredSyntax, same, tinted };
export type { ResolvedScheme, Scheme, Syntax, TokenSpec };
