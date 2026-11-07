// @ts-check
/**
 * Serves the built demo, `dist/demo/browser`, as static files: the app, the engine's worker and wasm, and the
 * datasets `pnpm build:data` generates. The page is cross-origin isolated, so that the performance overlay can
 * measure the whole tab, worker included. Nothing is cached, so a rebuild shows at once.
 *
 *   node projects/demo/serve.mjs [--port 8791]
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../../dist/demo/browser/", import.meta.url));
const { values } = parseArgs({ options: { port: { type: "string", default: "8791" }, host: { type: "string", default: "127.0.0.1" } } });

/** @type {Readonly<Record<string, string>>} */
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".wasm": "application/wasm",
  ".arrows": "application/vnd.apache.arrow.stream",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

/**
 * The file a request path names under `root`, or null if it would leave it.
 * @param {string} path
 * @returns {string | null}
 */
function fileFor(path) {
  const relative = normalize(decodeURIComponent(path)).replace(/^([/\\])+/u, "");
  const file = join(root, relative === "" ? "index.html" : relative);
  return file.startsWith(root) ? file : null;
}

const server = createServer((request, response) => {
  const headers = { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp", "cache-control": "no-cache" };
  const fail = (/** @type {number} */ status, /** @type {string} */ text) => {
    response.writeHead(status, { ...headers, "content-type": "text/plain; charset=utf-8" });
    response.end(text);
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    fail(405, "only GET and HEAD");
    return;
  }
  let file;
  try {
    file = fileFor(new URL(request.url ?? "/", "http://localhost").pathname);
  } catch {
    file = null;
  }
  if (file === null) {
    fail(404, "not found");
    return;
  }
  const found = file;
  stat(found).then(
    (info) => {
      if (!info.isFile()) {
        fail(404, "not found");
        return;
      }
      response.writeHead(200, { ...headers, "content-type": TYPES[extname(found)] ?? "application/octet-stream", "content-length": info.size });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(found).pipe(response);
    },
    () => {
      fail(404, "not found");
    }
  );
});

server.listen(Number(values.port), values.host, () => {
  console.log(JSON.stringify({ url: `http://${values.host}:${values.port}/`, root }));
  stat(join(root, "index.html")).catch(() => {
    console.error(`${root} holds no built demo: run pnpm build:demo`);
  });
});

for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
  });
}
