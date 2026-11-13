/* The `vp dev` that `vp run shot` starts, and how it ends: the task stops it and everything it started, once the shots
 * are taken or when the task is interrupted, and the task then ends by itself. The dev server is a fake: Node, which
 * starts a second Node that answers on the app's port as its `vp dev` would, as `vp` starts Vite's. A driver, Node on
 * dev-server.ts, stands for the task. The same test holds on Linux and on Windows. */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { rootPath } from "#preset/fixture-mode.ts";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const devServerModule = pathToFileURL(path.join(root, "src/preset/dev-server.ts")).href;

/** A port nothing listens on. */
async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = z
    .custom<AddressInfo>((value) => typeof value === "object")
    .parse(server.address());
  server.close();
  await once(server, "close");
  return port;
}

/** The fake `vp dev`: a Node that starts the server in a Node of its own, and stays up until that one ends. */
const fakeDev = `
const { spawn } = require("node:child_process");
const server = 'require("node:http").createServer((request, response) => response.end(request.url === ${JSON.stringify(rootPath)} ? process.env.APP_ROOT : request.url === "/pid" ? String(process.pid) : "<!doctype html>")).listen(Number(process.env.APP_PORT), "127.0.0.1");';
spawn(process.execPath, ["-e", server], { stdio: "inherit" }).on("exit", () => process.exit());
setInterval(() => undefined, 1000);
`;

/** The driver: starts the fake through devServer, prints the pid of the Node that answers on the port, then stops it,
 * or waits to be interrupted. */
const driver = `
const { devServer } = await import(process.argv[1]);
const { stop } = await devServer(process.env.APP_ORIGIN, process.env.APP_ROOT, {
  command: process.execPath,
  args: ["-e", ${JSON.stringify(fakeDev)}],
});
const pid = await (await fetch(\`\${process.env.APP_ORIGIN}/pid\`)).text();
process.stdout.write(\`\${pid}\\n\`);
if (process.argv[2] === "stop") {
  stop();
}
`;

/** What answers `url` within a second, or `undefined`. */
async function answer(url: string): Promise<string | undefined> {
  try {
    // oxlint-disable-next-line basis/no-fetch -- this asks the fake dev server, in Node, outside any app's client.
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return await response.text();
  } catch {
    return undefined;
  }
}

/** Whether the process `pid` is running. */
function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The servers the tests started, stopped after each so that a failing test leaves nothing running. */
const servers: number[] = [];

afterEach(() => {
  for (const pid of servers.splice(0)) {
    if (running(pid)) {
      process.kill(pid);
    }
  }
});

/** The driver on `how`, once its dev server is up, and the pid of the Node that answers on the port. */
async function startDriver(
  how: "stop" | "wait",
): Promise<{ readonly driven: ChildProcess; readonly origin: string; readonly server: number }> {
  const port = await freePort();
  const origin = `http://127.0.0.1:${String(port)}`;
  const driven = spawn(
    process.execPath,
    ["--input-type=module", "-e", driver, devServerModule, how],
    {
      env: { ...process.env, APP_ORIGIN: origin, APP_PORT: String(port), APP_ROOT: root },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  const [said] = z.tuple([z.unknown()]).parse(await once(driven.stdout ?? driven, "data"));
  const server = Number(String(said).trim());
  servers.push(server);
  return { driven, origin, server };
}

/** Waits up to `ms` for `done`, asking every 100 ms. */
async function within(ms: number, done: () => Promise<boolean> | boolean): Promise<boolean> {
  if (await done()) {
    return true;
  }
  if (ms <= 0) {
    return false;
  }
  await sleep(100);
  return within(ms - 100, done);
}

/** Whether the driver has ended, and nothing it started still runs or listens. */
async function nothingLeft(
  driven: ChildProcess,
  origin: string,
  server: number,
): Promise<{ readonly ended: boolean; readonly listening: boolean; readonly running: boolean }> {
  const ended = await within(10_000, () => driven.exitCode !== null || driven.signalCode !== null);
  await within(5000, async () => !running(server) && (await answer(origin)) === undefined);
  return { ended, listening: (await answer(origin)) !== undefined, running: running(server) };
}

describe("the vp dev that vp run shot starts", () => {
  test(
    "is stopped with all it started, and the task then ends by itself",
    { timeout: 30_000 },
    async () => {
      const { driven, origin, server } = await startDriver("stop");
      expect(server).toBeGreaterThan(0);
      expect(await nothingLeft(driven, origin, server)).toStrictEqual({
        ended: true,
        listening: false,
        running: false,
      });
    },
  );

  test(
    "is stopped with all it started when the task is interrupted",
    { timeout: 30_000 },
    async () => {
      const { driven, origin, server } = await startDriver("wait");
      driven.kill("SIGINT");
      expect(await nothingLeft(driven, origin, server)).toStrictEqual({
        ended: true,
        listening: false,
        running: false,
      });
    },
  );
});
