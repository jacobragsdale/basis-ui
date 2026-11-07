/* The stylesheets that register and declare the tokens: the package's own, once a page, and each theme's. Every
 * declaration is in the `parallax` cascade layer, below any rule a host writes.
 *
 * An element is a parallax host when it carries `data-px-scheme`, as `useParallaxTheme()`'s attributes set it; its
 * `data-px-theme` names its theme, and `data-px-density="comfortable"` adds the density's step to its rows. */

import { chartEntries } from "./charts.ts";
import type { ParallaxTheme } from "./define.ts";
import { tokenNames } from "./define.ts";
import { given, registeredSyntax } from "./kinds.ts";
import { specs } from "./tokens.ts";
import type { ResolvedScheme, TokenSpec } from "./kinds.ts";

/** How much taller a comfortable grid's rows and header are than a compact one's, in pixels. */
const densityStep = 6;

/** The elements the tokens are declared on. */
const hosts = "[data-px-scheme]";

/** Every custom property the package's stylesheet declares. */
const entries: readonly TokenSpec[] = [...tokenNames.map((name) => specs[name]), ...chartEntries()];

/** Every token's public property, such as `--px-accent`, chart colours included: what a host or a theme can set. */
const tokenProperties: readonly string[] = entries.map((entry) => `--px-${entry.property}`);

function resolved(entry: TokenSpec, value: string): string {
  const own = given(entry.property, value);
  const stepped = entry.stepped === true ? `calc(${own} + var(--_px-density-step, 0px))` : own;
  return `--_px-${entry.property}: ${stepped};`;
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
  const comfortable = `${hosts}[data-px-density="comfortable"] { --_px-density-step: ${String(densityStep)}px; }`;
  // The scheme also picks the native controls' and scrollbars' colours; checkboxes and radios take the accent.
  const native =
    "accent-color: var(--_px-accent); scrollbar-color: var(--_px-scrollbar) transparent;";
  const lightRule = `${hosts} { color-scheme: light; ${native} ${light.join(" ")} }`;
  const darkRule = `${hosts}[data-px-scheme="dark"] { color-scheme: dark; ${dark.join(" ")} }`;
  return [
    ...entries.flatMap((entry) => registration(entry)),
    `@layer parallax { ${lightRule} ${darkRule} ${comfortable} }`,
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

/** Adds a stylesheet to a document's head once, by its id. */
function install(document: Document, id: string, css: string): void {
  if (document.querySelector(`#${id}`) !== null) {
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

/** Adds a theme's stylesheet to a document once. */
function installTheme(document: Document, theme: ParallaxTheme): void {
  install(document, `px-theme-${theme.name}`, themeStyles(theme));
}

export {
  densityStep,
  entries,
  installTheme,
  installTokenStyles,
  themeStyles,
  tokenProperties,
  tokenStyles,
};
