/* Serves the built scale harness as static files, with the datasets the bench wrote under `/data/`, from this process,
 * so that the bench needs no server of its own to start and stop. A file is streamed, since the largest is 1 GB. */

import { once } from "node:events";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { Server, ServerResponse } from "node:http";
import path from "node:path";

const status = { forbidden: 403, notFound: 404, ok: 200 } as const;

const types: Readonly<Record<string, string>> = {
  ".arrows": "application/vnd.apache.arrow.stream",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
};

function fail(response: ServerResponse, code: number, text: string): void {
  response.writeHead(code, { "content-type": "text/plain; charset=utf-8" });
  response.end(text);
}

/** The file a request's path names under `roots`, or null if it would leave its root. */
function fileFor(url: string, roots: readonly (readonly [string, string])[]): string | null {
  const decoded = path.normalize(decodeURIComponent(url.split("?")[0] ?? "/"));
  const found = roots.find(([start]) => decoded.startsWith(start));
  if (found === undefined) {
    return null;
  }
  const [prefix, root] = found;
  const rest = decoded.slice(prefix.length);
  const file = path.join(root, rest === "" ? "index.html" : rest);
  return file.startsWith(root) ? file : null;
}

async function answer(
  url: string,
  response: ServerResponse,
  roots: readonly (readonly [string, string])[],
): Promise<void> {
  const file = fileFor(url, roots);
  if (file === null) {
    fail(response, status.forbidden, "Forbidden");
    return;
  }
  const found = await stat(file).catch(() => null);
  if (found === null || !found.isFile()) {
    fail(response, status.notFound, `Not found: ${url}`);
    return;
  }
  response.writeHead(status.ok, {
    "cache-control": "no-store",
    "content-length": String(found.size),
    "content-type": types[path.extname(file)] ?? "application/octet-stream",
  });
  createReadStream(file).pipe(response);
}

/** Serves `site` at `/` and `data` at `/data/` on 127.0.0.1, on a port the system picks, and returns the server and its
 * address. */
async function serve(site: string, data: string): Promise<{ server: Server; url: string }> {
  const roots = [
    ["/data/", data],
    ["/", site],
  ] as const;
  const server = createServer((request, response) => {
    answer(request.url ?? "/", response, roots).catch(() => {
      fail(response, status.notFound, "Not found");
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("ERROR the harness's server has no port.");
  }
  return { server, url: `http://127.0.0.1:${String(address.port)}` };
}

export { serve };
