/* The framework's lines in an app's own configuration, which the drift check, `vp run sync --check`, holds the app to
 * (docs/design.md, A UI repo): `src/styles.css` imports @basis/ui's stylesheet, and @basis/parallax's when the app
 * depends on it, and declares nothing of its own, so no app adds a colour, a utility or a class; `tsconfig.json`
 * extends the strict tsconfig and loosens nothing; and `vite.config.ts` is the preset, its plugins and its tests, with
 * the app's own budget and, for a machine with no browser, `basisTest({ browser: false })`. `vp run sync` writes the
 * first two, and the third when it is missing, since only the app knows its budget. sync.ts applies them. */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { dependencyProblems, specProblems } from "./dependencies.ts";
import { appDependencies, ignored } from "./installed.ts";

const stylesFile = "src/styles.css";
const tsconfigFile = "tsconfig.json";
const viteConfigFile = "vite.config.ts";

/** `src/styles.css`, for an app that depends on @basis/parallax or not. */
function stylesText(parallax: boolean): string {
  return [
    '@import "@basis/ui/styles.css";',
    ...(parallax ? ['@import "@basis/parallax/styles.css";'] : []),
    "",
  ].join("\n");
}

const tsconfigText = `{
  "extends": "@basis/ui/tsconfig.json",
  "include": ["src", "vite.config.ts"]
}
`;

const viteConfigText = `import { basisPlugins, basisPreset, basisTest } from "@basis/ui/preset";
import { defineConfig } from "vite-plus";

export default defineConfig({
  ...basisPreset(),
  plugins: basisPlugins(),
  test: await basisTest(),
});
`;

/** Where the string that opens at `start` ends, past its closing quote. */
function stringEnd(text: string, start: number): number {
  let end = start + 1;
  while (end < text.length && text.charAt(end) !== text.charAt(start)) {
    end += text.charAt(end) === "\\" ? 2 : 1;
  }
  return end + 1;
}

/** Where the comment that opens at `index` ends, or `undefined` where none opens. */
function commentEnd(text: string, index: number): number | undefined {
  const pair = text.slice(index, index + 2);
  if (pair !== "//" && pair !== "/*") {
    return undefined;
  }
  const [close, length] = pair === "//" ? ["\n", 0] : ["*/", 2];
  const end = text.indexOf(close, index + 2);
  return end === -1 ? text.length : end + length;
}

/** Where what opens at `index` ends, a string, a comment or a character, and what of it `compact` keeps. */
function stepAt(text: string, index: number): { readonly end: number; readonly kept: string } {
  const char = text.charAt(index);
  if (char === '"' || char === "'" || char === "`") {
    const end = stringEnd(text, index);
    return { end, kept: text.slice(index, end) };
  }
  const comment = commentEnd(text, index);
  if (comment !== undefined) {
    return { end: comment, kept: "" };
  }
  return { end: index + 1, kept: /\s/u.test(char) ? "" : char };
}

/** `text` with its comments and every space outside a string removed, and a comma before a closing bracket, so that
 * any formatting of the same lines reads alike. */
function compact(text: string): string {
  let out = "";
  for (let index = 0; index < text.length;) {
    const { end, kept } = stepAt(text, index);
    out += kept;
    index = end;
  }
  return out.replaceAll(/,(?=[)\]}])/gu, "");
}

const kilobytes = String.raw`\d+(?:\.\d+)?`;
const routeBudget = String.raw`"[^"]*":\{(?:css:${kilobytes},js:${kilobytes}|js:${kilobytes},css:${kilobytes})\}`;
const viteConfigPattern = new RegExp(
  String.raw`^import\{basisPlugins,basisPreset,basisTest\}from"@basis/ui/preset";import\{defineConfig\}from"vite-plus";exportdefaultdefineConfig\(\{\.\.\.basisPreset\((?:\{budget:\{(?:${routeBudget}(?:,${routeBudget})*)?\}\})?\),plugins:basisPlugins\(\),test:awaitbasisTest\((?:\{browser:(?:true|false)\})?\)\}\);$`,
  "u",
);

/** The one line for an app's `vite.config.ts`, when it holds more than the framework's lines. */
function viteConfigProblem(text: string): string | undefined {
  return viteConfigPattern.test(compact(text))
    ? undefined
    : 'ERROR vite.config.ts holds more than the framework\'s lines, and an app configures nothing of its own: make it import basisPlugins, basisPreset and basisTest from "@basis/ui/preset" and defineConfig from "vite-plus", and export defineConfig({ ...basisPreset(), plugins: basisPlugins(), test: await basisTest() }), with basisPreset({ budget: { "/": { css: 25, js: 180 } } }) for a budget and basisTest({ browser: false }) for no browser.';
}

/** The one line for `src/styles.css` or `tsconfig.json`, when it differs from the framework's lines. */
function configFileProblem(file: string, current: string | undefined): string {
  if (current === undefined) {
    return `ERROR ${file} is missing: run vp run sync to write it.`;
  }
  return file === "tsconfig.json"
    ? "ERROR tsconfig.json differs from the lines that extend @basis/ui's strict tsconfig, and an app loosens no check: run vp run sync to put it back, and fix the code a check fails on rather than the check."
    : `ERROR ${file} holds more than @basis/ui's stylesheet, and an app declares no colour, utility, variant or class of its own: run vp run sync to put it back, and take each look from a component's variant or a theme token, which vp run docs --search WORDS finds.`;
}

/** Whether `file` is one `configFileProblem` words. */
function isConfigFile(file: string): boolean {
  return file === stylesFile || file === tsconfigFile;
}

/** Whether `file` is the app's own configuration, rather than a file of the framework's. */
function isAppConfig(file: string): boolean {
  return isConfigFile(file) || file === viteConfigFile;
}

/** The app's vite.config.ts, or `undefined` while it has none. */
async function viteConfigOf(root: string): Promise<string | undefined> {
  const text = await readFile(path.join(root, viteConfigFile), "utf8").catch(ignored);
  return text ?? undefined;
}

/** The framework's lines in the app's own configuration, as files `vp run sync` writes: its stylesheet, with
 * @basis/parallax's when the app depends on it, its tsconfig, and its vite.config.ts while it has none. */
async function configFiles(
  root: string,
): Promise<readonly { readonly path: string; readonly text: string }[]> {
  const dependencies = await appDependencies(root);
  const viteConfig = await viteConfigOf(root);
  return [
    { path: stylesFile, text: stylesText(dependencies.has("@basis/parallax")) },
    { path: tsconfigFile, text: tsconfigText },
    ...(viteConfig === undefined ? [{ path: viteConfigFile, text: viteConfigText }] : []),
  ];
}

/** A problem the drift check finds: the file it is in, and its one ERROR line. */
interface Problem {
  readonly file: string;
  readonly text: string;
}

/** The configuration files a tool reads beside the framework's, or instead of it, by the tool: Vitest's own, a second
 * Vite one, which Vite prefers to `vite.config.ts` when it is `.js`, and Oxlint's and Oxfmt's, which `vp check` reads
 * beside the preset's. */
const siblingTools: readonly (readonly [RegExp, string])[] = [
  [/^vitest\.config\.[cm]?[jt]s$/u, "Vitest"],
  [/^vite\.config\.(?:[cm][jt]s|js)$/u, "Vite"],
  [/^\.oxlintrc(?:\.jsonc?)?$/u, "Oxlint"],
  [/^\.oxfmtrc(?:\.jsonc?)?$/u, "Oxfmt"],
];

/** One line for each configuration file beside the framework's in the app's root, which its tool would read. */
async function siblingProblems(root: string): Promise<readonly Problem[]> {
  const names = await readdir(root).catch((): string[] => []);
  return names.toSorted().flatMap((file) => {
    const tool = siblingTools.find(([pattern]) => pattern.test(file))?.[1];
    return tool === undefined
      ? []
      : [
          {
            file,
            text: `ERROR ${file} configures ${tool} beside the framework's configuration, which ${tool} reads instead of it or as well, so this app's checks would differ from every other's: delete it, and keep what the app needs in vite.config.ts's framework lines.`,
          },
        ];
  });
}

/** One ERROR line for what `vp run sync` cannot put right: `vite.config.ts` beyond the framework's lines, a
 * configuration file beside the framework's, and each dependency an app may not have, or installs from elsewhere. */
async function appProblems(root: string): Promise<readonly Problem[]> {
  const viteConfig = await viteConfigOf(root);
  const config = viteConfig === undefined ? undefined : viteConfigProblem(viteConfig);
  const dependencies = await appDependencies(root);
  const inPackage = [...dependencyProblems(dependencies.keys()), ...specProblems(dependencies)];
  return [
    ...(config === undefined ? [] : [{ file: viteConfigFile, text: config }]),
    ...(await siblingProblems(root)),
    ...inPackage.map((text) => ({ file: "package.json", text })),
  ];
}

export {
  appProblems,
  configFileProblem,
  configFiles,
  isAppConfig,
  isConfigFile,
  viteConfigProblem,
};
export type { Problem };
