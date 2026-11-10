/* Type-checks the component catalogue as an app compiles it: each example is written to a module of its own in
 * packages/consumer, the app configured exactly as the README says, and a probe module holds each prop the catalogue
 * lists to the component's own props, so a prop read wrongly from Base UI's declarations, or named in a doc comment,
 * fails as surely as an example that does not compile. Both are checked there with the app's TypeScript.
 * `@basis/parallax`, which the consumer app does not install, is read from its source through a path mapping. */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

import type { Catalogue, CatalogueComponent } from "./format.ts";

const consumer = new URL("../../../consumer/", import.meta.url);
const folder = new URL(".catalogue-examples/", consumer);
const probeFile = "props.tsx";

/** A probe's name for a component's prop, such as `Select__onValueChange`. */
function probeName(component: CatalogueComponent, prop: string): string {
  return `${component.name}__${prop.replaceAll(/\W/gu, "_")}`;
}

/** The probe module: for every component, a type that compiles only if each prop listed is one it takes. */
function probeModule(catalogue: Catalogue): { source: string; labels: string[] } {
  const probed = catalogue.components.filter((component) => component.props.length > 0);
  const byModule = Map.groupBy(probed, (component) => component.module);
  const imports = [...byModule].map(
    ([module, components]) =>
      `import type { ${components.map(({ name }) => name).join(", ")} } from "${module}";`,
  );
  const header = [
    'import type { ComponentProps } from "react";',
    ...imports,
    "",
    "/** Every key of every member of a union of props, as a component in several modes takes them. */",
    "type Keys<T> = T extends unknown ? keyof T : never;",
    "type Expect<T extends true> = T;",
    "",
  ];
  const labels = header.map(() => "");
  const probes = probed.flatMap((component) =>
    component.props.map((prop) => {
      labels.push(`${component.name}'s ${prop.name}`);
      return `export type ${probeName(component, prop.name)} = Expect<"${prop.name}" extends Keys<ComponentProps<typeof ${component.name}>> ? true : false>;`;
    }),
  );
  return { labels, source: `${[...header, ...probes].join("\n")}\n` };
}

/** Writes each example and the probe module into the consumer app's scratch folder, with a tsconfig that extends the
 * app's and maps `@basis/parallax` to its source. */
function writeExamples(catalogue: Catalogue): string[] {
  rmSync(folder, { force: true, recursive: true });
  mkdirSync(folder, { recursive: true });
  for (const component of catalogue.components) {
    if (component.example !== undefined) {
      writeFileSync(new URL(`${component.family}.tsx`, folder), component.example);
    }
  }
  const { labels, source } = probeModule(catalogue);
  writeFileSync(new URL(probeFile, folder), source);
  const tsconfig = {
    compilerOptions: { paths: { "@basis/parallax": ["../../parallax/src/index.ts"] } },
    extends: "../tsconfig.json",
    include: ["*.tsx"],
  };
  writeFileSync(new URL("tsconfig.json", folder), `${JSON.stringify(tsconfig, undefined, 2)}\n`);
  return labels;
}

/** tsc's report, with each failing probe named by the component and prop it holds. */
function labelled(report: string, labels: readonly string[]): string {
  return report
    .split("\n")
    .map((line) => {
      const at = /props\.tsx\((?<line>\d+),\d+\): /u.exec(line)?.groups?.["line"];
      const label = at === undefined ? "" : (labels[Number(at) - 1] ?? "");
      return label === ""
        ? line
        : `${line} The catalogue lists ${label}, which it does not take: correct the doc comment or src/catalogue/.`;
    })
    .join("\n");
}

/** tsc's report on every example and probe in `catalogue`, or the empty string when they all compile. */
function exampleErrors(catalogue: Catalogue): string {
  const labels = writeExamples(catalogue);
  const tsc = new URL("node_modules/.bin/tsc", consumer).pathname;
  try {
    execFileSync(tsc, ["--noEmit", "--pretty", "false", "-p", folder.pathname], {
      encoding: "utf8",
    });
    return "";
  } catch (error) {
    const report =
      error instanceof Error && "stdout" in error ? String(error.stdout).trim() : String(error);
    return labelled(report, labels);
  }
}

export { exampleErrors };
