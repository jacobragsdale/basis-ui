/* `vp run new`, a page made from an operation in the app's `openapi.json`:
 *
 *   vp run new table NAME --operation ID   a DataTable of the rows a GET answers, a column for each field
 *   vp run new page NAME --operation ID    a card of the fields a GET answers, a detail view
 *   vp run new form NAME --operation ID    a form for the body an operation takes, sent with its mutation
 *
 * Each writes four things: the page, `src/pages/NAME.tsx`; its test beside it; a fixture whose body the schema
 * accepts, `fixtures/NAME.json`, unless a fixture answers that request already; and the route `/NAME`, with a segment
 * for each path parameter, in `src/routes.ts`. Then it prints the commands to run next. It never overwrites a file
 * unless `--force` says to. Every failure is one ERROR line that ends with its fix. */

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { camel, operationNamed, pascal, readApi } from "./api-operations.ts";
import type { ApiDocument } from "./api-operations.ts";
import { fixtureFor, parameterValue, sameRequest } from "./fixture-new.ts";
import { fieldsOf } from "./scaffold-fields.ts";
import { formatFiles, writeNew } from "./scaffold-files.ts";
import type { NewFile } from "./scaffold-files.ts";
import { formPage } from "./scaffold-form.ts";
import { filesOf } from "./scaffold-plan.ts";
import type { Scaffold, ScaffoldKind } from "./scaffold-plan.ts";
import { routesFile, withRoute } from "./scaffold-route.ts";
import { checkCallable, modelOf, shapeOf } from "./scaffold-shape.ts";
import { formTest, viewTest } from "./scaffold-tests.ts";
import { detailPage, tablePage } from "./scaffold-view.ts";
import { wordsOf } from "./schema-example.ts";
import { TaskError } from "./task-error.ts";

const usage =
  "run vp run new page|table|form NAME --operation ID, such as vp run new table positions --operation list_positions, with --force to replace the files it would write";

const pages: Readonly<Record<ScaffoldKind, (scaffold: Scaffold) => string>> = {
  form: formPage,
  page: detailPage,
  table: tablePage,
};

interface NewArgs {
  readonly kind: ScaffoldKind;
  readonly name: string;
  readonly operation: string;
  readonly force: boolean;
}

function isKind(kind: string): kind is ScaffoldKind {
  return kind in pages;
}

/** The flag at `at` of `rest`: the operation `--operation ID` or `--operation=ID` names, or `--force`, and how many
 * arguments it takes. */
function flagAt(
  rest: readonly string[],
  at: number,
): { readonly operation?: string; readonly force?: true; readonly width: number } {
  const arg = rest[at] ?? "";
  const next = rest[at + 1];
  if (arg === "--force") {
    return { force: true, width: 1 };
  }
  if (arg.startsWith("--operation=")) {
    return { operation: arg.slice("--operation=".length), width: 1 };
  }
  if (arg === "--operation" && next !== undefined) {
    return { operation: next, width: 2 };
  }
  throw new TaskError(`ERROR vp run new takes no ${arg}: ${usage}.`);
}

/** The operation and `--force`, from what follows NAME. */
function flagsOf(rest: readonly string[]): {
  readonly operation: string | undefined;
  readonly force: boolean;
} {
  const found: { operation: string | undefined; force: boolean } = {
    force: false,
    operation: undefined,
  };
  for (let at = 0; at < rest.length;) {
    const { width, ...flag } = flagAt(rest, at);
    Object.assign(found, flag);
    at += width;
  }
  return found;
}

function argsOf(args: readonly string[]): NewArgs {
  const [kind = "", name = "", ...rest] = args;
  if (!isKind(kind)) {
    throw new TaskError(
      `ERROR vp run new makes a page, a table or a form, ${kind === "" ? "and was given none" : `not ${kind}`}: ${usage}.`,
    );
  }
  if (!/^[a-z][\da-z]*(?:-[\da-z]+)*$/u.test(name)) {
    throw new TaskError(
      `ERROR ${name === "" ? "the page has no name" : `${name} is not a page name vp run new takes`}: name it in lower case, with hyphens between words, such as trade-blotter, and ${usage}.`,
    );
  }
  const { operation, force } = flagsOf(rest);
  if (operation === undefined || operation === "") {
    throw new TaskError(
      `ERROR vp run new needs the operation the page calls, as --operation ID: ${usage}.`,
    );
  }
  return { force, kind, name, operation };
}

function planOf(api: ApiDocument, { kind, name, operation: id }: NewArgs): Scaffold {
  const operation = operationNamed(api, id);
  const reading = { api, kind, operation };
  const shape = shapeOf(reading);
  checkCallable(reading, shape);
  const parameters = operation.parameters
    .filter((parameter) => parameter.in === "path")
    .map((parameter) => ({
      name: parameter.name,
      value: parameterValue(api, parameter, false),
      variable: camel(parameter.name),
    }));
  const segments = parameters.map(({ variable }) => `/$${variable}`);
  const values = parameters.map(({ value }) => `/${encodeURIComponent(value)}`);
  const cased = pascal(operation.id);
  return {
    client: { call: camel(operation.id), handler: `get${cased}MockHandler`, hook: `use${cased}` },
    component: `${pascal(name)}Page`,
    document: api.document,
    fields: fieldsOf(api.document, shape),
    fixture: fixtureFor(api, operation),
    kind,
    model: modelOf(reading, shape),
    name,
    openPath: [`/${name}`, ...values].join(""),
    operation,
    parameters,
    routePath: [`/${name}`, ...segments].join(""),
    title: wordsOf(name),
  };
}

/** The routes file as it is, or a failure for an app with none. */
function routesText(root: string): string {
  try {
    return readFileSync(path.join(root, routesFile), "utf8");
  } catch {
    throw new TaskError(
      `ERROR ${routesFile} is missing, and vp run new adds the page's route to it: run vp run new in the app's root, which holds ${routesFile}.`,
    );
  }
}

/** What `vp run new` prints once it has written the files: what it wrote, and the commands to run next. */
function doneText(
  scaffold: Scaffold,
  written: readonly NewFile[],
  { others, routed }: { readonly others: readonly string[]; readonly routed: boolean },
): string {
  const names = written.map(({ file }) => file);
  const last = names.pop() ?? "";
  const route = routed
    ? `, and added the route ${scaffold.routePath} to ${routesFile}`
    : `; ${routesFile} has its route already`;
  const lines = [`Wrote ${names.length === 0 ? last : `${names.join(", ")} and ${last}`}${route}.`];
  if (others.length > 0) {
    lines.push(
      `${others.join(", ")} ${others.length === 1 ? "answers" : "answer"} ${scaffold.fixture.request.method} ${scaffold.fixture.request.path} already, so vp run new wrote no fixture of its own.`,
    );
  }
  lines.push("Next, run:", "  vp run verify", `  vp run shot ${scaffold.openPath}`);
  return lines.join("\n");
}

/** The files a scaffold writes: the page, its test, and its fixture unless another answers the same request. */
function newFiles(scaffold: Scaffold, others: readonly string[]): NewFile[] {
  const files = filesOf(scaffold);
  const test = scaffold.kind === "form" ? formTest(scaffold) : viewTest(scaffold);
  const fixture = {
    file: files.fixture,
    text: `${JSON.stringify(scaffold.fixture, undefined, 2)}\n`,
  };
  return [
    { file: files.page, text: pages[scaffold.kind](scaffold) },
    { file: files.test, text: test },
    ...(others.length === 0 ? [fixture] : []),
  ];
}

/** `vp run new KIND NAME --operation ID [--force]` in the app at `root`. */
async function newTask(root: string, args: readonly string[]): Promise<string> {
  const options = argsOf(args);
  const scaffold = planOf(readApi(root), options);
  const routed = withRoute(routesText(root), scaffold);
  const others = sameRequest(root, scaffold.fixture, filesOf(scaffold).fixture);
  const files = newFiles(scaffold, others);
  writeNew(root, files, {
    force: options.force,
    instead: "give the page another NAME",
    task: "vp run new",
  });
  if (routed !== undefined) {
    await writeFile(path.join(root, routesFile), routed);
  }
  formatFiles(root, [
    ...files.map(({ file }) => file),
    ...(routed === undefined ? [] : [routesFile]),
  ]);
  return doneText(scaffold, files, { others, routed: routed !== undefined });
}

export { newTask };
