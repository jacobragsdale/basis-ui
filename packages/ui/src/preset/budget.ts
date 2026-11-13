/* The budget task the preset gives every app, run by Node in the app's root after `vp build`:
 *
 *   vp run budget
 *
 * It serves the app's `dist/` on a free port, opens each route its budget names in headless Chromium, each in a fresh
 * browser context so nothing comes from a cache, and weighs what the route loaded: every JavaScript and CSS file of
 * the build the page asked for, its workers' and lazy chunks' included, by the `.gz` file `vp build` wrote beside it, or
 * gzipped here when the file is too small to have one. It prints one line a route, and an `ERROR` line for each route
 * over its budget, which fails the task. A request to `/api` is answered 404: a page's chunks load whether or not its
 * data does. */

import { once } from "node:events";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { gzipSync } from "node:zlib";

import type { Browser } from "playwright";

import { budgetOf, verdict } from "./budget-options.ts";
import type { Budget, RouteWeight } from "./budget-options.ts";
import { TaskError } from "./task-error.ts";
import { launch, open } from "./shot-page.ts";

const contentTypes: Readonly<Record<string, string>> = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".mjs": "text/javascript",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
};

const ok = 200;
const notFound = 404;

/** The file under `dist` that `url` names, `index.html` for a route the app's router serves, or `undefined`. */
function fileFor(dist: string, url: string): string | undefined {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  if (pathname.startsWith("/api/") || pathname === "/api") {
    return undefined;
  }
  const file = path.join(dist, pathname);
  if (!file.startsWith(dist)) {
    return undefined;
  }
  if (existsSync(file) && statSync(file).isFile()) {
    return file;
  }
  return path.extname(pathname) === "" ? path.join(dist, "index.html") : undefined;
}

/** The port a server listening on TCP was given. */
function portOf(address: AddressInfo | string | null): number {
  if (address === null || typeof address === "string") {
    throw new TaskError(
      "ERROR the budget's server got no port to serve dist/ on: run vp run budget again, and report the message if it repeats.",
    );
  }
  return address.port;
}

/** A static server for `dist` on a free port. */
async function serveDist(
  dist: string,
): Promise<{ readonly server: Server; readonly origin: string }> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const file = fileFor(dist, request.url ?? "/");
    if (file === undefined) {
      response.writeHead(notFound).end();
      return;
    }
    const type = contentTypes[path.extname(file)] ?? "application/octet-stream";
    response.writeHead(ok, { "content-type": type }).end(readFileSync(file));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { origin: `http://127.0.0.1:${String(portOf(server.address()))}`, server };
}

/** A file's size gzipped: its `.gz` beside it when the build wrote one, else gzipped now at the build's level. */
function gzippedSize(file: string): number {
  const written = `${file}.gz`;
  return existsSync(written)
    ? statSync(written).size
    : gzipSync(readFileSync(file), { level: 9 }).length;
}

/** The JavaScript and CSS among `files`, gzipped, in bytes. */
function weigh(route: string, files: Iterable<string>): RouteWeight {
  let js = 0;
  let css = 0;
  for (const file of files) {
    const extension = path.extname(file);
    if (extension === ".js" || extension === ".mjs") {
      js += gzippedSize(file);
    } else if (extension === ".css") {
      css += gzippedSize(file);
    }
  }
  return { css, js, route };
}

/** Where the build is served, and the folder it is served from. */
interface Served {
  readonly origin: string;
  readonly dist: string;
}

/** What opening `route` loads, in a fresh context of its own: every file of the build the page or its workers ask
 * for. */
async function weighRoute(
  browser: Browser,
  { origin, dist }: Served,
  route: string,
): Promise<RouteWeight> {
  const files = new Set<string>();
  const context = await browser.newContext();
  context.on("request", (request) => {
    const url = new URL(request.url());
    const file = url.origin === origin ? fileFor(dist, url.pathname) : undefined;
    if (file !== undefined) {
      files.add(file);
    }
  });
  try {
    await open(await context.newPage(), `${origin}${route}`, 0);
  } finally {
    await context.close();
  }
  return weigh(route, files);
}

/** What opening each route of `budget` loads, against the build in `dist` served on a free port. */
async function weighRoutes(dist: string, budget: Budget): Promise<RouteWeight[]> {
  const { server, origin } = await serveDist(dist);
  try {
    const browser = await launch("budget");
    try {
      return await Promise.all(
        Object.keys(budget).map(async (route) => weighRoute(browser, { dist, origin }, route)),
      );
    } finally {
      await browser.close();
    }
  } finally {
    // Closed whatever happens, the browser's launch included, so a failure ends the task rather than its server
    // holding it open.
    server.close();
  }
}

/** Weighs each route of the budget the arguments carry against the app's build, and says how each did. */
async function budgetTask(root: string, args: readonly string[]): Promise<string> {
  const budget = budgetOf(args);
  const dist = path.join(root, "dist");
  if (!existsSync(path.join(dist, "index.html"))) {
    throw new TaskError(
      "ERROR dist/index.html is missing, so there is no build to weigh: run vp build, then vp run budget again.",
    );
  }
  const { lines, over } = verdict(await weighRoutes(dist, budget), budget);
  if (over) {
    throw new TaskError(lines.join("\n"));
  }
  return lines.join("\n");
}

export { budgetTask, fileFor };
