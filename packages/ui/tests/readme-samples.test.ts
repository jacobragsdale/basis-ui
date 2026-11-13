/* Every fenced `ts` and `tsx` sample of @basis/ui's and @basis/parallax's READMEs, type-checked as an app compiles it,
 * as the catalogue's examples are (src/catalogue/examples.ts): each sample a module of its own in packages/consumer,
 * the app configured by hand as the README says, with `@basis/parallax` read from its source. A sample is a fragment:
 * a name it uses unimported that the packages export, such as `Grid` after an earlier sample imported it, is imported
 * for it from the catalogue; the app's own names, such as `columns` or `positions`, are declared as `any`; and its
 * imports of the app's own modules, such as `#api/client.ts`, are any too. So what is checked is everything a sample
 * takes from the packages: its imports, components, props and calls. A name that a module of the packages exports and
 * the packages do not, such as an internal schema, is refused, since an app cannot reach it. */

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, vi } from "vite-plus/test";
import { z } from "zod";

/* Each test here starts Node on a task, the compiler, a build, a browser or vp, which a busy CI runner can make take
 * many seconds: a minute holds there, where Vitest's 5 s did not, and a test that hangs still fails. */
vi.setConfig({ testTimeout: 60_000 });

const packages = fileURLToPath(new URL("../../", import.meta.url));
const consumer = path.join(packages, "consumer");
const folder = path.join(consumer, ".readme-samples");
const readmes = ["ui/README.md", "parallax/README.md"];

/** Errors that come of a sample being a fragment, and not of what it takes from the packages: a parameter or a call
 * typed by a name declared `any`, a value the sample names and leaves unused, and the `unknown` an `any` infers. */
const fragmentErrors = new Set([2347, 6133, 6192, 6196, 6198, 6205, 7006, 7031, 18_046]);

interface Sample {
  /** The module it is written to, such as `ui-973.tsx`: the README's package, and the line its fence opens on. */
  readonly file: string;
  readonly text: string;
}

/** Each fenced `ts` and `tsx` block of each README, its indentation as a list item's removed. */
function samples(): readonly Sample[] {
  return readmes.flatMap((readme) => {
    const text = readFileSync(path.join(packages, readme), "utf8");
    const fences = text.matchAll(
      /^(?<indent> *)```(?<lang>tsx?)\n(?<body>[\s\S]*?)^\k<indent>```/gmu,
    );
    return [...fences].map((fence) => {
      const { body = "", indent = "", lang = "ts" } = fence.groups ?? {};
      const line = text.slice(0, fence.index).split("\n").length;
      const lines = body.split("\n").map((each) => each.slice(indent.length));
      return { file: `${path.dirname(readme)}-${String(line)}.${lang}`, text: lines.join("\n") };
    });
  });
}

/** `tsc`'s report on the folder, one diagnostic a line, or the empty string. */
function compile(): string {
  try {
    execFileSync(
      path.join(consumer, "node_modules/.bin/tsc"),
      ["--noEmit", "--pretty", "false", "-p", folder],
      {
        encoding: "utf8",
      },
    );
    return "";
  } catch (error) {
    return error instanceof Error && "stdout" in error ? String(error.stdout) : String(error);
  }
}

/** Writes each sample, its relative imports moved under `#app/`, which `app.d.ts` declares, and the tsconfig. */
function write(all: readonly Sample[]): void {
  rmSync(folder, { force: true, recursive: true });
  mkdirSync(folder, { recursive: true });
  for (const sample of all) {
    writeFileSync(
      path.join(folder, sample.file),
      sample.text.replaceAll(/from "\.{1,2}\//gu, 'from "#app/'),
    );
  }
  writeFileSync(path.join(folder, "app.d.ts"), 'declare module "#*";\n');
  const tsconfig = {
    compilerOptions: {
      paths: {
        "@basis/parallax": ["../../parallax/src/index.ts"],
        "@tanstack/react-form": ["../../example/node_modules/@tanstack/react-form"],
      },
    },
    extends: "../tsconfig.json",
    include: ["*.ts", "*.tsx"],
  };
  writeFileSync(path.join(folder, "tsconfig.json"), JSON.stringify(tsconfig));
}

/** The names each module uses and does not define, from `tsc`'s "Cannot find name" errors. */
function freeNames(report: string): ReadonlyMap<string, readonly string[]> {
  const found = report.matchAll(
    /(?<file>[^\s/\\()]+)\(\d+,\d+\): error TS(?:2304|2552|2582): Cannot find name '(?<name>\w+)'/gu,
  );
  const byFile = Map.groupBy([...found], (match) => match.groups?.["file"] ?? "");
  return new Map(
    [...byFile].map(([file, matches]) => [
      file,
      [...new Set(matches.map((match) => match.groups?.["name"] ?? ""))],
    ]),
  );
}

const entrySchema = z.object({
  exported: z.boolean().optional(),
  module: z.string(),
  name: z.string(),
});
const catalogueSchema = z.object({
  components: z.array(entrySchema),
  functions: z.array(entrySchema),
  icons: z.array(z.string()),
  types: z.array(entrySchema),
});

/** Where a name the packages export comes from, and whether it is a type alone. */
interface Exported {
  readonly module: string;
  readonly type: boolean;
}

/** Whether a catalogue entry is the packages' own, not one of Base UI's they take props from. */
function ours(entry: z.infer<typeof entrySchema>): boolean {
  return entry.module.startsWith("@basis/");
}

/** Every name the packages export, from the catalogue. */
function exportedNames(): ReadonlyMap<string, Exported> {
  const text = readFileSync(path.join(packages, "ui/catalogue.json"), "utf8");
  const catalogue = catalogueSchema.parse(JSON.parse(text));
  const types = catalogue.types.filter((entry) => ours(entry) && entry.exported !== false);
  const values = [...catalogue.components, ...catalogue.functions].filter((entry) => ours(entry));
  return new Map<string, Exported>([
    ...types.map((entry): [string, Exported] => [entry.name, { module: entry.module, type: true }]),
    ...values.map((entry): [string, Exported] => [
      entry.name,
      { module: entry.module, type: false },
    ]),
    ...catalogue.icons.map((name): [string, Exported] => [
      name,
      { module: "@basis/ui", type: false },
    ]),
  ]);
}

/** The names one module's source exports: by `export const` and its kin, and in an `export { ... }` list. */
function exportsOf(source: string): readonly string[] {
  const declared = source.matchAll(
    /^export (?:const|function|class|interface|type) (?<name>\w+)/gmu,
  );
  const listed = source.matchAll(/^export (?:type )?\{(?<names>[^}]*)\}/gmu);
  return [
    ...[...declared].map((match) => match.groups?.["name"] ?? ""),
    ...[...listed].flatMap((match) =>
      (match.groups?.["names"] ?? "")
        .split(",")
        .map((name) => name.replace(/^\s*type\s+/u, "").trim()),
    ),
  ];
}

/** The names a module of the packages' sources exports. */
function moduleExports(): ReadonlySet<string> {
  const sources = ["ui/src", "parallax/src"].flatMap((root) =>
    readdirSync(path.join(packages, root), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
      .map((entry) => readFileSync(path.join(entry.parentPath, entry.name), "utf8")),
  );
  return new Set(sources.flatMap((source) => exportsOf(source)));
}

/** A line for each name a sample uses unimported that a module of the packages exports and the packages do not. */
function unexportedNames(
  free: ReadonlyMap<string, readonly string[]>,
  exported: ReadonlyMap<string, Exported>,
): readonly string[] {
  const internal = moduleExports();
  return [...free].flatMap(([file, names]) =>
    names
      .filter((name) => !exported.has(name) && internal.has(name))
      .map(
        (name) =>
          `${file}: ${name} is exported by a module of the packages, and not by the packages`,
      ),
  );
}

/** The sample as it is checked: its relative imports under `#app/`, an import of each name the packages export that
 * it uses unimported, and a declaration of each of the app's own. */
function completed(
  sample: Sample,
  free: readonly string[],
  exported: ReturnType<typeof exportedNames>,
): string {
  const imports = Map.groupBy(
    free.filter((name) => exported.has(name)),
    (name) => {
      const entry = exported.get(name);
      return `${entry?.type === true ? "import type" : "import"} {*} from "${entry?.module ?? ""}";`;
    },
  );
  const head = [...imports].map(([line, names]) => line.replace("*", ` ${names.join(", ")} `));
  const own = free
    .filter((name) => !exported.has(name))
    .map((name) => `declare const ${name}: any;\ntype ${name}<A = any, B = any> = any;`);
  const body = sample.text.replaceAll(/from "\.{1,2}\//gu, 'from "#app/');
  return `${[...head, body, ...own].join("\n")}\n`;
}

test("every README sample compiles in an app, taking from the packages only what they export", () => {
  const all = samples();
  write(all);
  const free = freeNames(compile());
  const exported = exportedNames();
  const unexported = unexportedNames(free, exported);
  for (const sample of all) {
    writeFileSync(
      path.join(folder, sample.file),
      completed(sample, free.get(sample.file) ?? [], exported),
    );
  }
  const errors = compile()
    .split("\n")
    .filter((line) => {
      const code = /error TS(?<code>\d+)/u.exec(line)?.groups?.["code"];
      return code !== undefined && !fragmentErrors.has(Number(code));
    });
  rmSync(folder, { force: true, recursive: true });
  expect([...unexported, ...errors]).toStrictEqual([]);
});
