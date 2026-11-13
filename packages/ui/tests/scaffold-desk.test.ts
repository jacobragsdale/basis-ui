/* `vp run new` on the desk's document (scaffold-desk-api.ts), in an app from the template with a nested layout and
 * packages/example's node_modules: each kind of page, from operations unlike the example's, then the app's own
 * fixtures, lint, types and tests, in a Node DOM, pass on what was written, its generated client and mocks included. */

import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { text as textOf } from "node:stream/consumers";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { example } from "./fixture-app.ts";
import { deskDocument, deskMocksTest } from "./scaffold-desk-api.ts";

const script = fileURLToPath(new URL("../src/preset/tasks.ts", import.meta.url));
const clientScript = fileURLToPath(new URL("../src/preset/client.ts", import.meta.url));
const template = fileURLToPath(new URL("../../create/templates/app/", import.meta.url));

/** What the app's checks take at most, on a machine running the other test files. */
const appTimeout = 300_000;

/** The environment without git's variables, which a commit hook sets, or Vitest's, which would reach the app's own. */
const environment = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith("GIT_") && !name.startsWith("VITEST") && name !== "NODE_ENV",
    ),
  ),
  BASIS_TEST_DOM: "node",
};

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** The framework tasks' script, or the one given, on `args` in `root`, without blocking the other test files. */
async function runIn(root: string, ...args: string[]): Promise<Run> {
  const [first = "", ...rest] = args;
  const command = first === clientScript ? [first, ...rest] : [script, ...args];
  const child = spawn(process.execPath, command, { cwd: root, env: environment });
  const [stdout, stderr, closed] = await Promise.all([
    textOf(child.stdout),
    textOf(child.stderr),
    once(child, "close"),
  ]);
  const status: unknown = closed[0];
  return { status: typeof status === "number" ? status : null, stderr, stdout };
}

/* The app's routes: a home page, a pathless layout holding the admin pages, and an audit page, the root's last child
 * followed by a comment, as a person writes them. */
const routes = `/* The desk's routes, in AppShell. */

import { AppShell } from "@basis/ui";
import { createRootRoute, createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { createElement } from "react";

/** Every page in the shell. */
function Shell(): ReturnType<typeof AppShell> {
  return createElement(AppShell, { appName: "Desk" });
}

const rootRoute = createRootRoute({ component: Shell });

const homeRoute = createRoute({
  component: lazyRouteComponent(async () => import("./pages/home.tsx"), "HomePage"),
  getParentRoute: () => rootRoute,
  path: "/",
  staticData: { title: "Home" },
});

const adminRoute = createRoute({ getParentRoute: () => rootRoute, id: "admin" });

const usersRoute = createRoute({
  component: lazyRouteComponent(async () => import("./pages/users.tsx"), "UsersPage"),
  getParentRoute: () => adminRoute,
  path: "/users",
  staticData: { title: "Users" },
});

const auditRoute = createRoute({
  component: lazyRouteComponent(async () => import("./pages/audit.tsx"), "AuditPage"),
  getParentRoute: () => rootRoute,
  path: "/audit",
  staticData: { title: "Audit" },
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  adminRoute.addChildren([usersRoute]),
  auditRoute,
  // The audit log is the last of the root's own pages.
]);

export { routeTree };
`;

/** A page with a title and a line, as the app's own pages beside the scaffolded ones. */
function plainPage(component: string, title: string): string {
  return `import { Page, TypographyP } from "@basis/ui";
import type { ReactElement } from "react";

function ${component}(): ReactElement {
  return (
    <Page title="${title}">
      <TypographyP>The desk pages for ${title.toLowerCase()}.</TypographyP>
    </Page>
  );
}

export { ${component} };
`;
}

const handNote = {
  format: "basis-ui-fixture/1",
  operation_id: "latest_desk_note",
  recorded_at: "2026-11-13T09:00:00Z",
  request: { method: "GET", path: "/desk-notes/latest" },
  response: {
    body: { code: "FXD", text: "Rates desk closes early." },
    media_type: "application/json",
    status: 200,
  },
};

const manifestSchema = z.looseObject({ dependencies: z.record(z.string(), z.string()) });

const leftOut = new Set(["src/sample", "src/pages/home.test.ts", "fixtures", "openapi.json"]);

let app = "";

/** A file the app holds, as text. */
function read(file: string): string {
  return readFileSync(path.join(app, file), "utf8");
}

const runs: Run[] = [];

/** The app's package.json without TanStack Form, as an app made before the template had it, which its node_modules,
 * the example's, still holds. Its line is removed, so the file stays as vp fmt writes it. */
function withoutForm(root: string): void {
  const file = path.join(root, "package.json");
  writeFileSync(
    file,
    readFileSync(file, "utf8").replace(/\n\s*"@tanstack\/react-form": "[^"]*",/u, ""),
  );
}

/** The desk's app: the template without its sample, on the desk's document and routes, with the example's
 * node_modules. */
function makeDeskApp(): string {
  const root = mkdtempSync(path.join(tmpdir(), "basis-ui-scaffold-desk-"));
  cpSync(template, root, {
    filter: (source) => {
      const relative = path.relative(template, source).split(path.sep).join("/");
      return ![...leftOut].some((out) => relative === out || relative.startsWith(`${out}/`));
    },
    recursive: true,
  });
  cpSync(path.join(template, "_gitignore"), path.join(root, ".gitignore"));
  symlinkSync(path.join(example, "node_modules"), path.join(root, "node_modules"), "junction");
  const files = {
    // The desk's note, which no example can be made for, answered by a fixture written by hand.
    "fixtures/desk-note.json": `${JSON.stringify(handNote, undefined, 2)}\n`,
    "openapi.json": `${JSON.stringify(deskDocument, undefined, 2)}\n`,
    "src/api/mocks.test.ts": deskMocksTest,
    "src/pages/audit.tsx": plainPage("AuditPage", "Audit"),
    "src/pages/home.tsx": plainPage("HomePage", "Home"),
    "src/pages/users.tsx": plainPage("UsersPage", "Users"),
    "src/routes.ts": routes,
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  withoutForm(root);
  return root;
}

beforeAll(async () => {
  app = makeDeskApp();
  runs.push(
    await runIn(app, clientScript, "pull"),
    await runIn(app, "new", "table", "orders", "--operation", "list_orders"),
    await runIn(app, "new", "page", "trade", "--operation", "get_trade"),
    await runIn(app, "new", "form", "book-trade", "--operation", "book_trade"),
    await runIn(app, "new", "page", "latest-page", "--operation", "latest_trade_page"),
    await runIn(app, "new", "page", "note", "--operation", "latest_desk_note"),
  );
}, appTimeout);

afterAll(() => {
  rmSync(app, { force: true, recursive: true });
});

describe("vp run new on the desk's document", () => {
  test("generates the client and scaffolds a table, three pages and a form", () => {
    expect(runs.map(({ status, stderr }) => ({ status, stderr }))).toStrictEqual(
      runs.map(() => ({ status: 0, stderr: "" })),
    );
  });

  test("passes a route's parameter to the hook as the type the API declares", () => {
    expect(read("src/pages/trade.tsx")).toContain("useGetTrade(Number(tradeId))");
    expect(read("src/pages/orders.tsx")).toContain("useListOrders(sideOf(side))");
    expect(read("src/pages/book-trade.tsx")).toContain(
      "sending.mutateAsync({ deskId: Number(deskId), data })",
    );
  });

  test("names a row by its whole value when no column is unique", () => {
    expect(read("src/pages/orders.tsx")).toContain("getRowId={(row) => JSON.stringify(row)}");
  });

  test("adds each route to the root's own children, past the layout's and the comment", () => {
    expect(read("src/routes.ts")).toContain(
      "adminRoute.addChildren([usersRoute]),\n  auditRoute,\n  ordersRoute,\n  tradeRoute,\n  bookTradeRoute,\n  latestPageRoute,\n  noteRoute,\n  // The audit log",
    );
  });

  test("names the form's dependency when the app lacks it, and the template has it", () => {
    expect(runs[3]?.stdout).toContain("  vp add @tanstack/react-form\n");
    expect(runs[2]?.stdout).not.toContain("vp add");
    const text = readFileSync(path.join(template, "package.json"), "utf8");
    const manifest = manifestSchema.parse(JSON.parse(text));
    expect(Object.keys(manifest.dependencies)).toContain("@tanstack/react-form");
  });

  test("takes a page's test from a fixture that answers its request, which no schema example could make", () => {
    expect(runs[5]?.stdout).toContain(
      "fixtures/desk-note.json answers GET /desk-notes/latest already, so vp run new wrote no fixture of its own.",
    );
    expect(read("src/pages/note.test.ts")).toContain('"Rates desk closes early."');
  });

  test("generates mocks that leave a property out of required out, rather than set it to undefined", () => {
    const mocks = read("src/api/generated/client.msw.ts");
    expect(mocks).toContain("...faker.helpers.arrayElement([{ notes: faker.string.alpha(");
    // One that may also be null orval always writes, as text or null, which its type takes.
    expect(mocks).toMatch(
      /memo: faker\.helpers\.arrayElement\(\[faker\.string\.alpha\([^\]]*\),null,\]\)/u,
    );
    expect(mocks).not.toContain(", undefined])");
  });

  test("mocks every string format orval's Zod output checks, and a pattern, with text it accepts", () => {
    const mocks = read("src/api/generated/client.msw.ts");
    expect(mocks).toContain("time: faker.date.anytime().toISOString().slice(11, 19)");
    expect(mocks).toContain('code: faker.helpers.arrayElement(["AAA-00","ZZZ-99"])');
    // Only the desk note's lookahead, which no text the preset makes can match, is left to orval's own mock.
    expect([...new Set(mocks.match(/fromRegExp\("[^"]*"\)/gu))]).toStrictEqual([
      'fromRegExp("^(?!N)[A-Z]{3}$")',
    ]);
    expect(read("src/api/generated/model/formats.zod.ts")).toContain('"uuid": zod.uuid()');
  });

  test("imports a model by the name orval gives it", () => {
    expect(read("src/pages/latest-page.tsx")).toContain("PageTrade");
  });
});

describe("what it writes on the desk's document", () => {
  test(
    "passes the app's checks as written: its fixtures, lint, types and tests",
    async () => {
      const checked = await runIn(
        app,
        "verify",
        "--stage",
        "fixtures",
        "--stage",
        "lint",
        "--stage",
        "types",
        "--stage",
        "tests",
      );
      expect(`${checked.stdout}\n${checked.stderr}`).toMatch(
        /^vp run verify passed 4 of 4 stages in [\d.]+ s\.$/mu,
      );
      expect(checked.status).toBe(0);
    },
    appTimeout,
  );
});
