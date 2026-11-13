/* `vp run shot`'s parts that can be checked without an app: which `vp dev` it trusts, what it says when the one it
 * starts fails, how it waits for a page, and the fix it names when Chromium is missing. Chromium is the one the
 * preset's Playwright pins, as `vp test` uses. */

import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { RequestListener, Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";
import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { devServer } from "#preset/dev-server.ts";
import { rootPath } from "#preset/fixture-mode.ts";
import { open } from "#preset/shot-page.ts";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

/** An HTTP server on a free port answering with `listener`, and its origin; the caller closes it. */
async function serving(
  listener: RequestListener,
): Promise<{ readonly server: Server; readonly origin: string }> {
  const server = createServer(listener);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = z
    .custom<AddressInfo>((value) => typeof value === "object")
    .parse(server.address());
  return { origin: `http://127.0.0.1:${String(port)}`, server };
}

/** A free port's origin, which nothing answers at. */
async function freeOrigin(): Promise<string> {
  const { server, origin } = await serving((_request, response) => {
    response.end();
  });
  server.close();
  await once(server, "close");
  return origin;
}

describe(devServer, () => {
  test("uses a vp dev that names this app's root, and refuses whatever else answers on the app's port", async () => {
    const { server, origin } = await serving((request, response) => {
      response.end(request.url === rootPath ? root : "<!doctype html><title>Another app</title>");
    });
    const other = await serving((_request, response) => {
      response.end("<!doctype html><title>Another app</title>");
    });
    try {
      await expect(devServer(origin, root)).resolves.toHaveProperty("stop");
      await expect(devServer(other.origin, root)).rejects.toThrow(
        `ERROR something other than this app's vp dev answers at ${other.origin}: stop the program that holds the port, then run vp run shot again.`,
      );
      await expect(devServer(origin, path.join(root, "src"))).rejects.toThrow(
        `ERROR the vp dev of ${root} answers at ${origin}, not this app's: stop it, then run vp run shot again.`,
      );
    } finally {
      server.close();
      other.server.close();
    }
  });

  test("fails at once, with the dev server's output, when it stops before it answers", async () => {
    const output = new PassThrough();
    const origin = await freeOrigin();
    const fails = devServer(origin, root, {
      args: ["-e", 'console.error("ERROR fixtures/a.json: a fixture problem"); process.exit(1);'],
      command: process.execPath,
      output,
    });
    await expect(fails).rejects.toThrow(
      `ERROR vp dev stopped, with exit code 1, before it answered at ${origin}: fix what its output above says, then run vp run shot again.`,
    );
    expect(String(output.read())).toContain("ERROR fixtures/a.json: a fixture problem");
  });

  test("fails at once when vp dev cannot be started", async () => {
    const origin = await freeOrigin();
    const fails = devServer(origin, root, {
      args: [],
      command: "basis-ui-no-such-command",
      output: new PassThrough(),
    });
    await expect(fails).rejects.toThrow(
      "ERROR vp run shot could not start vp dev (spawn basis-ui-no-such-command ENOENT): run vp install, then vp run shot again.",
    );
  });
});

describe(open, () => {
  test(
    "pictures a page that polls the network, which never goes quiet",
    { timeout: 20_000 },
    async () => {
      const { server, origin } = await serving((request, response) => {
        response.setHeader("content-type", "text/html");
        response.end(
          request.url === "/"
            ? "<!doctype html><title>Polls</title><script>setInterval(() => fetch('/poll'), 100);</script>"
            : "{}",
        );
      });
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(3000);
        await expect(open(page, `${origin}/`, 0)).resolves.toStrictEqual([]);
      } finally {
        await browser.close();
        server.close();
      }
    },
  );
});

describe("Chromium, when it is missing", () => {
  test("is installed as vp run doctor installs it, with Playwright at the version @basis/ui pins", () => {
    const browsers = mkdtempSync(path.join(tmpdir(), "basis-ui-no-browsers-"));
    const { version } = z
      .object({ version: z.string() })
      .parse(createRequire(import.meta.url)("playwright/package.json"));
    try {
      const launched = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          "const { launch } = await import(process.argv[1]); await launch().catch((error) => process.stdout.write(error.message));",
          pathToFileURL(path.join(root, "src/preset/shot-page.ts")).href,
        ],
        { encoding: "utf8", env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers } },
      );
      expect(launched.stdout).toBe(
        `ERROR Playwright's Chromium is not installed: run vp dlx playwright@${version} install chromium, then vp run shot again.`,
      );
    } finally {
      rmSync(browsers, { force: true, recursive: true });
    }
  });
});
