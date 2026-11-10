/* The parts of `vp run shot` beside the picture, each in the Chromium the preset's Playwright pins on a small page: the
 * axe check and its exceptions for Base UI, the network file, the comparison with a baseline, the routes `--all`
 * finds, and the report `--json` prints. */

import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { RequestListener, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium } from "playwright";
import { afterAll, describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { axeViolations, violationLine } from "#preset/shot-axe.ts";
import { compareToBaseline } from "#preset/shot-compare.ts";
import { recordNetwork } from "#preset/shot-network.ts";
import { shotReportSchema } from "#preset/shot-report.ts";
import { routerPaths, routesToShoot, skippedLine } from "#preset/shot-routes.ts";

/** The pages the tests open, by path. */
const pages: Readonly<Record<string, string>> = {
  "/axe": `<!doctype html><html lang="en"><title>Axe</title><body>
<main><h1>Positions</h1><img src="data:," id="chart"></main>
<div data-base-ui-portal><div role="listbox" aria-label="Books"><div role="option" aria-selected="false">Rates</div></div></div>
</body></html>`,
  "/axe-bare": `<!doctype html><html lang="en"><title>Axe</title><body>
<main><h1>Positions</h1></main>
<div><div role="listbox" aria-label="Books"><div role="option" aria-selected="false">Rates</div></div></div>
</body></html>`,
  "/block": `<!doctype html><style>body{margin:0;background:#fff}div{width:10px;height:10px;background:#000}</style><div></div>`,
  "/blank": `<!doctype html><style>body{margin:0;background:#fff}</style>`,
  "/fetches": `<!doctype html><title>Fetches</title><script>
fetch("/api/conventions"); fetch("/api/trades?book=rates"); fetch("/api/live"); fetch("/static.js");
</script>`,
  "/router": `<!doctype html><title>Router</title><script>
self.__TSR_ROUTER__ = { routesByPath: { "/": {}, "/bonds/$security": {}, "/settlements/new/": {} } };
</script>`,
};

/** What `/api` answers with: the headers fixture mode names its answers with, or none, as a live API answers. */
const answers: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "/api/conventions": {
    "x-basis-fixture-file": "fixtures/conventions.json",
    "x-basis-fixture-source": "fixture",
  },
  "/api/live": {},
  "/api/trades": { "x-basis-fixture-source": "none" },
};

const listener: RequestListener = (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const headers = answers[url.pathname];
  if (headers !== undefined) {
    response.writeHead(headers["x-basis-fixture-source"] === "none" ? 501 : 200, headers);
    response.end("{}");
    return;
  }
  response.setHeader("content-type", "text/html");
  response.end(pages[url.pathname] ?? "");
};

/** The server the pages come from, on a free port, and its origin. */
async function serve(
  handler: RequestListener,
): Promise<{ readonly server: Server; readonly origin: string }> {
  const created = createServer(handler);
  created.listen(0, "127.0.0.1");
  await once(created, "listening");
  const { port } = z
    .custom<AddressInfo>((value) => typeof value === "object")
    .parse(created.address());
  return { origin: `http://127.0.0.1:${String(port)}`, server: created };
}

const { server, origin } = await serve(listener);
const browser = await chromium.launch({ headless: true });

afterAll(async () => {
  await browser.close();
  server.close();
});

/** The violations axe finds on the page at `pathname`. */
async function violationsOn(pathname: string): Promise<Awaited<ReturnType<typeof axeViolations>>> {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}${pathname}`);
    return await axeViolations(page);
  } finally {
    await page.close();
  }
}

describe(axeViolations, () => {
  test("finds each element at fault, and leaves out the region of Base UI's portalled popups", async () => {
    const found = await violationsOn("/axe");
    expect(found.map(({ rule, target }) => `${rule} ${target}`)).toStrictEqual([
      "image-alt #chart",
    ]);
    const outsideThePortal = await violationsOn("/axe-bare");
    expect(outsideThePortal.map(({ rule }) => rule)).toStrictEqual(["region"]);
  });

  test("makes each element at fault one line: the rule, the element, what it asks and the fix", async () => {
    const [found] = await violationsOn("/axe");
    expect(found === undefined ? "" : violationLine(found)).toBe(
      `ERROR axe image-alt at #chart, <img src="data:," id="chart">: Images must have alternative text (https://dequeuniversity.com/rules/axe/4.14/image-alt?application=axeAPI): fix any of the following: Element does not have an alt attribute; aria-label attribute does not exist or is empty; aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty; Element has no title attribute; Element's default semantics were not overridden with role="none" or role="presentation"`,
    );
  });
});

describe(recordNetwork, () => {
  test("lists each request to /api with its status and source, and the file that answered", async () => {
    const page = await browser.newPage();
    const network = recordNetwork(page);
    await page.goto(`${origin}/fetches`);
    await page.waitForLoadState("networkidle");
    await network.quiet(2000);
    await page.close();
    expect(network.lines().toSorted()).toStrictEqual([
      "GET /api/conventions 200 fixture fixtures/conventions.json",
      "GET /api/live 200 live",
      "GET /api/trades?book=rates 501 none",
    ]);
    expect(network.count()).toBe(3);
  });
});

/** Pictures `baseline` as `baselines/home.png` and `shown` as `.shots/home.png` in a folder of their own, 50 pixels
 * square, and compares the two as `vp run shot --compare baselines` does, comparing `.shots/NAME.png`. */
async function compareShots(
  baseline: string,
  shown: string,
  name = "home",
): Promise<Awaited<ReturnType<typeof compareToBaseline>>> {
  const root = mkdtempSync(path.join(tmpdir(), "basis-ui-compare-"));
  const page = await browser.newPage({ viewport: { height: 50, width: 50 } });
  try {
    await page.goto(`${origin}${baseline}`);
    await page.screenshot({ path: path.join(root, "baselines/home.png") });
    await page.goto(`${origin}${shown}`);
    await page.screenshot({ path: path.join(root, `.shots/${name}.png`) });
    return await compareToBaseline({ folder: "baselines", root, route: "/" }, `.shots/${name}.png`);
  } finally {
    await page.close();
    rmSync(root, { force: true, recursive: true });
  }
}

describe(compareToBaseline, () => {
  test("finds no change between two pictures of the same page", async () => {
    expect(await compareShots("/blank", "/blank")).toStrictEqual({
      compare: { baseline: "baselines/home.png", changed: 0, diff: null },
      problems: [],
    });
  });

  test("counts the changed pixels and writes the diff", async () => {
    expect(await compareShots("/blank", "/block")).toStrictEqual({
      compare: { baseline: "baselines/home.png", changed: 100, diff: ".shots/home.diff.png" },
      problems: [
        {
          kind: "compare",
          message:
            "ERROR .shots/home.png differs from baselines/home.png in 100 pixels, drawn in red in .shots/home.diff.png: look at the diff, then fix the page, or if the change is meant, copy .shots/home.png over baselines/home.png.",
          route: "/",
        },
      ],
    });
  });

  test("says how to make a baseline when there is none", async () => {
    expect(await compareShots("/blank", "/blank", "other")).toStrictEqual({
      compare: null,
      problems: [
        {
          kind: "compare",
          message:
            "ERROR baselines/other.png does not exist, so .shots/other.png has no baseline: copy .shots/other.png there once it is right, then run the shot again with --compare baselines.",
          route: "/",
        },
      ],
    });
  });
});

describe("the routes --all pictures", () => {
  test("are the router's paths, a named route standing for the path with a parameter it matches", async () => {
    const page = await browser.newPage();
    const paths = await routerPaths(page, `${origin}/router`);
    await page.close();
    expect(paths).toStrictEqual(["/", "/bonds/$security", "/settlements/new/"]);
    expect(routesToShoot([], paths)).toStrictEqual({
      routes: ["/", "/settlements/new"],
      skipped: ["/bonds/$security"],
    });
    expect(routesToShoot(["/bonds/US91282CRF04?settle=2026-11-06"], paths)).toStrictEqual({
      routes: ["/bonds/US91282CRF04?settle=2026-11-06", "/", "/settlements/new"],
      skipped: [],
    });
    expect(skippedLine("/bonds/$security")).toBe(
      "skipped /bonds/$security, which takes a parameter: name one of its pages beside --all, as vp run shot --all /bonds/VALUE.",
    );
  });

  test("fail with the fix on a page with no TanStack Router", { timeout: 20_000 }, async () => {
    const page = await browser.newPage();
    await expect(routerPaths(page, `${origin}/blank`)).rejects.toThrow(
      expect.objectContaining({
        message: `ERROR --all found no TanStack Router on ${origin}/blank within 10 s, so it cannot list the routes: check that vp run shot / pictures the app, or name each route, as vp run shot / /positions.`,
      }),
    );
    await page.close();
  });
});

describe("the report --json prints", () => {
  test("holds the files, the counts and every problem as its ERROR line", () => {
    const report = {
      ok: false,
      problems: [
        {
          kind: "console",
          message:
            "ERROR / logged 1 error, listed in .shots/home.console.txt: fix them, or read them there before trusting the picture.",
          route: "/",
        },
      ],
      shots: [
        {
          axe: 0,
          compare: null,
          console: 1,
          files: {
            aria: ".shots/home.aria.yml",
            axe: ".shots/home.axe.txt",
            console: ".shots/home.console.txt",
            diff: null,
            network: ".shots/home.network.txt",
            png: ".shots/home.png",
          },
          requests: 2,
          route: "/",
        },
      ],
      skipped: [],
    };
    expect(shotReportSchema.parse(report)).toStrictEqual(report);
    expect(
      shotReportSchema.safeParse({
        ...report,
        problems: [{ kind: "axe", message: "no", route: "/" }],
      }).success,
    ).toBe(false);
  });
});
