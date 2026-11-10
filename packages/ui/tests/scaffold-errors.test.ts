/* The failures of `vp run new` and `vp run fixtures`, each held by its exact text: one line that starts with ERROR,
 * gives the reason and ends with the fix. The app is a temporary one holding basis's sample document, as
 * packages/example pins it; nothing here gets as far as writing a file. */

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { fixturesTask } from "#preset/fixture-new.ts";
import { newTask } from "#preset/scaffold.ts";

import { makeApp, removeApp, writeIn } from "./fixture-app.ts";

const routes = `import { createRootRoute, createRoute } from "@tanstack/react-router";

const rootRoute = createRootRoute({});
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" });
const routeTree = rootRoute.addChildren([homeRoute]);

export { routeTree };
`;

let app = "";

/** The message a task fails with, or `""` when it does not fail. */
async function messageOf(run: Promise<unknown>): Promise<string> {
  try {
    await run;
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

beforeAll(() => {
  app = makeApp({ "src/pages/positions.tsx": "export {};\n", "src/routes.ts": routes });
});

afterAll(() => {
  removeApp(app);
});

const newUsage =
  "run vp run new page|table|form NAME --operation ID, such as vp run new table positions --operation list_positions, with --force to replace the files it would write";
const fixturesUsage =
  "run vp run fixtures check, or vp run fixtures new OPERATION, with --status N for a status other than the first success and --force to replace a file";

describe("vp run new", () => {
  test.each([
    [
      "a kind it does not make",
      ["chart", "risk", "--operation", "conventions"],
      `ERROR vp run new makes a page, a table or a form, not chart: ${newUsage}.`,
    ],
    [
      "no kind",
      [],
      `ERROR vp run new makes a page, a table or a form, and was given none: ${newUsage}.`,
    ],
    [
      "a name not in kebab case",
      ["table", "Positions", "--operation", "conventions"],
      `ERROR Positions is not a page name vp run new takes: name it in lower case, with hyphens between words, such as trade-blotter, and ${newUsage}.`,
    ],
    [
      "no operation",
      ["table", "positions"],
      `ERROR vp run new needs the operation the page calls, as --operation ID: ${newUsage}.`,
    ],
    [
      "a flag it does not take",
      ["table", "positions", "--operation", "conventions", "--dry-run"],
      `ERROR vp run new takes no --dry-run: ${newUsage}.`,
    ],
    [
      "an operation the document lacks, with the closest it has",
      ["table", "positions", "--operation", "convention"],
      "ERROR convention is not an operation in openapi.json: did you mean conventions, coupons, bond? Run it again with one of them.",
    ],
    [
      "a table of one object",
      ["table", "terms", "--operation", "bond"],
      "ERROR operation bond answers one object, not a list of rows, so it makes no table: scaffold it with vp run new page NAME --operation bond.",
    ],
    [
      "a page of a list",
      ["page", "terms", "--operation", "conventions"],
      "ERROR operation conventions answers a list of rows, which a table shows: scaffold it with vp run new table NAME --operation conventions.",
    ],
    [
      "a table of a POST",
      ["table", "terms", "--operation", "record_settlement"],
      "ERROR operation record_settlement is a POST, and a table shows what a GET answers: scaffold a form for it with vp run new form NAME --operation record_settlement.",
    ],
    [
      "a table of a dataset route",
      ["table", "terms", "--operation", "coupons"],
      "ERROR operation coupons is a dataset route, which basis-ui's client asks for Arrow, and a scaffold reads JSON: show its rows in @basis/parallax's Grid, which vp run docs Grid describes.",
    ],
    [
      "a form of an operation that takes no body",
      ["form", "terms", "--operation", "bond"],
      "ERROR operation bond takes no JSON object as its body, so it makes no form: scaffold what a GET answers with vp run new page or vp run new table, or write the form by hand.",
    ],
    [
      "a page of an operation that requires its query",
      ["page", "accrual", "--operation", "accrued_interest"],
      "ERROR operation accrued_interest requires the query parameters face, rate, start, end, convention, which a scaffolded page cannot choose: write the page by hand, and its fixture with vp run fixtures new accrued_interest.",
    ],
    [
      "a page whose file exists",
      ["table", "positions", "--operation", "conventions"],
      "ERROR src/pages/positions.tsx exists, and vp run new never overwrites a file: give the page another NAME, or run it again with --force to replace it.",
    ],
  ])("fails on %s", async (_case, args, message) => {
    expect(await messageOf(newTask(app, args))).toBe(message);
  });

  test("fails on a routes file it cannot add to, with the route to add by hand", async () => {
    const other = makeApp({ "src/routes.ts": "export {};\n" });
    expect(await messageOf(newTask(other, ["page", "terms", "--operation", "bond"]))).toBe(
      `ERROR src/routes.ts has no rootRoute.addChildren([...]), so vp run new cannot add the route to it: add const termsRoute = createRoute({ component: lazyRouteComponent(async () => import("./pages/terms.tsx"), "TermsPage"), getParentRoute: () => rootRoute, path: "/terms/$security", staticData: { title: "Terms" }, }); to it, and termsRoute to rootRoute.addChildren, then run vp run new again.`,
    );
    removeApp(other);
  });

  test("fails on a route of the page's name at another path", async () => {
    writeIn(app, "src/routes.ts", routes.replace("const homeRoute", "const termsRoute"));
    expect(await messageOf(newTask(app, ["page", "terms", "--operation", "bond"]))).toBe(
      "ERROR src/routes.ts has a route named termsRoute or at /terms/$security already: give the page another NAME.",
    );
    writeIn(app, "src/routes.ts", routes);
  });
});

describe("vp run fixtures", () => {
  test.each([
    [
      "no operation",
      ["new"],
      `ERROR vp run fixtures new needs the operation's id: ${fixturesUsage}.`,
    ],
    [
      "--status without a status",
      ["new", "bond", "--status"],
      `ERROR --status takes an HTTP status, such as 404: ${fixturesUsage}.`,
    ],
    [
      "a status the operation does not declare",
      ["new", "bond", "--status", "418"],
      "ERROR operation bond declares no 418 response: name one it declares, 200, 404, 422, 502, 503, 504, with --status.",
    ],
    [
      "a flag it does not take",
      ["new", "bond", "--dry-run"],
      `ERROR vp run fixtures new takes no --dry-run: ${fixturesUsage}.`,
    ],
    [
      "an operation the document lacks, with the closest it has",
      ["new", "bondz"],
      "ERROR bondz is not an operation in openapi.json: did you mean bond, bond_yield, coupons? Run it again with one of them.",
    ],
    [
      "a dataset route's Arrow",
      ["new", "coupons"],
      "ERROR operation coupons answers 200 with Arrow, which basis-ui's client asks a dataset route for, and a fixture holds Arrow as bytes: export one with basis records export, or write the IPC stream's bytes in base64 as body_base64 with media_type application/vnd.apache.arrow.stream.",
    ],
    [
      "a command it does not have",
      ["make", "bond"],
      `ERROR make is no command of vp run fixtures: ${fixturesUsage}.`,
    ],
    [
      "check with an argument",
      ["check", "all"],
      `ERROR vp run fixtures check takes no all: ${fixturesUsage}.`,
    ],
  ])("fails on %s", async (_case, args, message) => {
    expect(await messageOf(fixturesTask(app, args))).toBe(message);
  });

  test("fails on a fixture whose file exists", async () => {
    writeIn(app, "fixtures/bond-404.json", "{}\n");
    expect(await messageOf(fixturesTask(app, ["new", "bond", "--status", "404"]))).toBe(
      "ERROR fixtures/bond-404.json exists, and vp run fixtures new never overwrites a file: run it again with --force to replace it.",
    );
  });
});
