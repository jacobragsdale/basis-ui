/* Serves the built harness as static files, with the datasets `parallax-datagen` wrote beside it under `/data/`.
 *
 *   node tests/e2e/charts/serve.ts [--port 8792]
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";

const here = import.meta.dirname;
/** Where each path prefix is served from; the rest is the built harness. */
const roots: readonly (readonly [string, string])[] = [
  ["/data/", path.join(here, "data")],
  ["/", path.join(here, "dist")],
];

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

const { values } = parseArgs({
  options: {
    host: { default: "127.0.0.1", type: "string" },
    port: { default: "8792", type: "string" },
  },
});

/** The file a request's path names, or null if it would leave its root. */
function fileFor(url: string): string | null {
  const decoded = path.normalize(decodeURIComponent(url.split("?")[0] ?? "/"));
  const [prefix, root] = roots.find(([start]) => decoded.startsWith(start)) ?? ["/", here];
  const rest = decoded.slice(prefix.length);
  const file = path.join(root, rest === "" ? "index.html" : rest);
  return file.startsWith(root) ? file : null;
}

function fail(response: ServerResponse, code: number, text: string): void {
  response.writeHead(code, { "content-type": "text/plain; charset=utf-8" });
  response.end(text);
}

/** Answers a request with the file it names. */
async function answer(url: string, response: ServerResponse): Promise<void> {
  const file = fileFor(url);
  if (file === null) {
    fail(response, status.forbidden, "Forbidden");
    return;
  }
  const found = await stat(file).catch(() => null);
  if (found?.isFile() !== true) {
    fail(response, status.notFound, "Not found");
    return;
  }
  response.writeHead(status.ok, {
    "cache-control": "no-cache",
    "content-length": String(found.size),
    "content-type": types[path.extname(file)] ?? "application/octet-stream",
  });
  createReadStream(file).pipe(response);
}

const server = createServer((request, response) => {
  answer(request.url ?? "/", response).catch(() => {
    fail(response, status.notFound, "Not found");
  });
});

server.listen(Number(values.port), values.host, () => {
  process.stdout.write(`Serving the harness at http://${values.host}:${values.port}\n`);
});
