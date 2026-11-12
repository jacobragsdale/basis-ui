/* The files fixtures' `body_file` names, which fixture mode's handler streams (src/fixtures/handlers.ts): `vp dev`
 * serves them under `bodyFilesPath` from the two fixture folders, and nothing else on disk. */

import { createReadStream, statSync } from "node:fs";
import type { ServerResponse } from "node:http";
import path from "node:path";

import type { ViteDevServer } from "vite-plus";

import { bodyFilesPath } from "#fixtures/answered-by.ts";
import { fixtureFolders } from "#fixtures/load.ts";

const notFound = 404;

/** The path from the app's root of a body file a request asks for, `fixtures/data/trades.arrows`, or `undefined` for
 * one outside the two fixture folders, or with a `..` part. */
function bodyFileAsked(url: string | undefined): string | undefined {
  const pathname = new URL(url ?? "/", "http://fixture.invalid").pathname.slice(1);
  const parts = pathname.split("/").map((part) => decodeURIComponent(part));
  const inFolder = [fixtureFolders.fixture, fixtureFolders.record].includes(parts[0] ?? "");
  return inFolder &&
    parts.length > 1 &&
    parts.every((part) => part !== "" && part !== "." && part !== "..")
    ? parts.join("/")
    : undefined;
}

/** Streams the body file a request under `bodyFilesPath` asks for, with its length, or answers 404. */
function serveBodyFile(root: string, url: string | undefined, response: ServerResponse): void {
  const asked = bodyFileAsked(url);
  const file = asked === undefined ? undefined : path.join(root, asked);
  const stats = file === undefined ? undefined : statSync(file, { throwIfNoEntry: false });
  if (file === undefined || stats?.isFile() !== true) {
    response.statusCode = notFound;
    response.end();
    return;
  }
  response.setHeader("content-type", "application/octet-stream");
  response.setHeader("content-length", String(stats.size));
  createReadStream(file).pipe(response);
}

/** Serves the body files of the app at `root` from `server`. */
function serveBodyFiles(server: ViteDevServer, root: string): void {
  server.middlewares.use(`/${bodyFilesPath}`, (request, response) => {
    serveBodyFile(root, request.url, response);
  });
}

export { bodyFileAsked, serveBodyFiles };
