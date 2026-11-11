/* The stylesheets that register and declare the tokens: the package's own, once a page, and each theme's. Every
 * declaration is in the `parallax` cascade layer, below any rule a host writes.
 *
 * An element is a parallax host when it carries `data-px-scheme`, as `useParallaxTheme()`'s attributes set it; its
 * `data-px-theme` names its theme. A theme's lengths, such as the `basis` theme's rows, may follow the page's density
 * through the variables they name. */

import { chartEntries } from "./chart-tokens.ts";
import type { ParallaxTheme } from "./define.ts";
import { tokenNames } from "./define.ts";
import { given, registeredSyntax } from "./kinds.ts";
import { specs } from "./tokens.ts";
import type { ResolvedScheme, TokenSpec } from "./kinds.ts";

/** The elements the tokens are declared on. */
const hosts = "[data-px-scheme]";

/** Every custom property the package's stylesheet declares. */
const entries: readonly TokenSpec[] = [...tokenNames.map((name) => specs[name]), ...chartEntries()];

/** Every token's public property, such as `--px-accent`, chart colours included: what a host or a theme can set. */
const tokenProperties: readonly string[] = entries.map((entry) => `--px-${entry.property}`);

function resolved(entry: TokenSpec, value: string): string {
  return `--_px-${entry.property}: ${given(entry.property, value)};`;
}

/** The `@property` rule that registers a colour or a length, so its computed value is concrete. */
function registration(entry: TokenSpec): readonly string[] {
  const syntax = registeredSyntax[entry.syntax];
  if (syntax === null) {
    return [];
  }
  const initial = entry.initial ?? entry.light;
  return [
    `@property --_px-${entry.property} { syntax: "${syntax}"; inherits: true; initial-value: ${initial}; }`,
  ];
}

/**
 * The stylesheet that registers and declares every token: `@property` rules for the colours and lengths, then the
 * light defaults on every host and the dark ones on hosts in the dark scheme.
 */
function baseStyles(): string {
  const light = entries.map((entry) => resolved(entry, entry.light));
  const dark = entries
    .filter((entry) => entry.dark !== entry.light)
    .map((entry) => resolved(entry, entry.dark));
  // The scheme also picks the native controls' and scrollbars' colours; checkboxes and radios take the accent.
  const native =
    "accent-color: var(--_px-accent); scrollbar-color: var(--_px-scrollbar) transparent;";
  const lightRule = `${hosts} { color-scheme: light; ${native} ${light.join(" ")} }`;
  const darkRule = `${hosts}[data-px-scheme="dark"] { color-scheme: dark; ${dark.join(" ")} }`;
  return [
    ...entries.flatMap((entry) => registration(entry)),
    `@layer parallax { ${lightRule} ${darkRule} }`,
  ].join("\n");
}

/** The stylesheet that registers and declares every token. */
const tokenStyles = baseStyles();

/** The stylesheet that declares a theme's values on the hosts given it, in each scheme. */
function themeStyles(theme: ParallaxTheme): string {
  const rule = (scheme: ResolvedScheme, values: Readonly<Record<string, string>>): string => {
    const declarations = Object.entries(values).map(
      ([property, value]) => `--_px-theme-${property}: ${value};`,
    );
    return declarations.length === 0
      ? ""
      : `${hosts}[data-px-theme="${theme.name}"][data-px-scheme="${scheme}"] { ${declarations.join(" ")} }`;
  };
  const rules = [rule("light", theme.light), rule("dark", theme.dark)].filter(
    (text) => text !== "",
  );
  return rules.length === 0 ? "" : `@layer parallax { ${rules.join(" ")} }`;
}

/** Puts a stylesheet in a document's head by its id, replacing the text of one already there if it differs. */
function install(document: Document, id: string, css: string): void {
  const existing = document.querySelector(`#${id}`);
  if (existing !== null) {
    if (existing.textContent !== css) {
      existing.textContent = css;
    }
    return;
  }
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.append(style);
}

/** Adds the token stylesheet to a document once. */
function installTokenStyles(document: Document): void {
  install(document, "px-theme-tokens", tokenStyles);
}

/** Puts a theme's stylesheet in a document, replacing the one of the same name installed before, if it differs. */
function installTheme(document: Document, theme: ParallaxTheme): void {
  install(document, `px-theme-${theme.name}`, themeStyles(theme));
}

export { entries, installTheme, installTokenStyles, themeStyles, tokenProperties, tokenStyles };
