/* The files fixtures' `body_file` names, which fixture mode's handler streams (src/fixtures/handlers.ts): `vp dev`
 * serves them under `bodyFilesPath` from the two fixture folders, and nothing else on disk. */

import { createReadStream, statSync } from "node:fs";
import type { ServerResponse } from "node:http";
import path from "node:path";

import type { ViteDevServer } from "vite-plus";

import { bodyFilesPath } from "#fixtures/answered-by.ts";
import { fixtureFolders } from "#fixtures/load.ts";

const notFound = 404;

/** An encoded separator, `%2F` or `%5C`, which would make one part of the path several once decoded. */
const encodedSeparator = /%(?:2f|5c)/iu;

/** The path, decoded once, or `undefined` for one that is not percent-encoded as a URL's must be. */
function decodedPath(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}

/** The file on disk a request for a body file asks for, in the app at `root`, or `undefined` for anything but a file
 * inside one of the two fixture folders. It is decided by the path the request resolves to, not by its parts: the path
 * is decoded once, an encoded separator is refused, and what is left is resolved against the folder it names and must
 * stay inside it, with `platform`'s separators, both slashes on Windows. */
function bodyFileAsked(
  root: string,
  url: string | undefined,
  platform: Pick<typeof path, "isAbsolute" | "relative" | "resolve"> = path,
): string | undefined {
  const pathname = new URL(url ?? "/", "http://fixture.invalid").pathname.slice(1);
  const decoded = encodedSeparator.test(pathname) ? undefined : decodedPath(pathname);
  const [folder = "", ...rest] = decoded?.split("/") ?? [];
  if (![fixtureFolders.fixture, fixtureFolders.record].includes(folder)) {
    return undefined;
  }
  const inside = platform.resolve(root, folder);
  const file = platform.resolve(inside, ...rest);
  const relative = platform.relative(inside, file);
  return relative !== "" && !relative.startsWith("..") && !platform.isAbsolute(relative)
    ? file
    : undefined;
}

/** Streams the body file a request under `bodyFilesPath` asks for, with its length, or answers 404. */
function serveBodyFile(root: string, url: string | undefined, response: ServerResponse): void {
  const file = bodyFileAsked(root, url);
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
