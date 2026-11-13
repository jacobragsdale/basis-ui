/* `vp run doctor` on what stopped the template on a desktop like the firm's: a Node older than the toolchain needs, a
 * registry that answers with a certificate Node does not trust, as behind a proxy that inspects TLS, one that does not
 * answer, and a Chromium that is downloaded but lacks the system's libraries. Run as the preset runs it, Node on
 * src/preset/tasks.ts in a temporary app with this package linked in; the registry is a local HTTPS server with a
 * certificate made for the test. */

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:https";
import { createServer as createNetServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { text as textOf } from "node:stream/consumers";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { satisfies } from "#preset/doctor-environment.ts";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(packageRoot, "src/preset/tasks.ts");

const environment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => !name.startsWith("GIT_") && name !== "NODE_EXTRA_CA_CERTS",
  ),
);

let app = "";

function write(file: string, text: string): void {
  mkdirSync(path.dirname(path.join(app, file)), { recursive: true });
  writeFileSync(path.join(app, file), text);
}

/** `vp run doctor` in the app, without blocking a server this process holds. */
async function doctor(env: Readonly<Record<string, string>> = {}): Promise<string> {
  const child = spawn(process.execPath, [script, "doctor"], {
    cwd: app,
    env: { ...environment, ...env },
  });
  const [stdout, stderr] = await Promise.all([
    textOf(child.stdout),
    textOf(child.stderr),
    once(child, "close"),
  ]);
  return `${stdout}${stderr}`;
}

/** A port nothing listens on, and that fetch does not refuse to ask, as it does port 1. */
async function closedPort(): Promise<number> {
  const server = createNetServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = z
    .custom<AddressInfo>((value) => typeof value === "object")
    .parse(server.address());
  server.close();
  await once(server, "close");
  return port;
}

let closed = "";

beforeEach(async () => {
  closed = `http://127.0.0.1:${String(await closedPort())}/`;
  app = mkdtempSync(path.join(tmpdir(), "basis-ui-doctor-"));
  mkdirSync(path.join(app, "node_modules/@basis"), { recursive: true });
  symlinkSync(packageRoot, path.join(app, "node_modules/@basis/ui"), "junction");
  write("package.json", JSON.stringify({ dependencies: { "@basis/ui": "0.0.0" }, name: "app" }));
  // A registry that refuses at once, so no test asks the internet.
  write(".npmrc", `registry=${closed}\n`);
});

afterEach(() => {
  rmSync(app, { force: true, recursive: true });
});

/** A registry the app's .npmrc names, served over HTTPS with a certificate made for the test, which signs itself as a
 * proxy's root does; and the certificate's file, for NODE_EXTRA_CA_CERTS. */
async function selfSignedRegistry(): Promise<{
  readonly registry: string;
  readonly cert: string;
  readonly close: () => void;
}> {
  const folder = mkdtempSync(path.join(tmpdir(), "basis-ui-doctor-tls-"));
  const [key, cert] = [path.join(folder, "key.pem"), path.join(folder, "cert.pem")];
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-keyout",
      key,
      "-out",
      cert,
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
  const server = createServer(
    { cert: readFileSync(cert), key: readFileSync(key) },
    (_request, response) => {
      response.end();
    },
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = z
    .custom<AddressInfo>((value) => typeof value === "object")
    .parse(server.address());
  const registry = `https://127.0.0.1:${String(port)}/`;
  write(".npmrc", `registry=${registry}\n`);
  return {
    cert,
    close: (): void => {
      server.close();
      rmSync(folder, { force: true, recursive: true });
    },
    registry,
  };
}

describe(satisfies, () => {
  test.each([
    ["22.18.0", true],
    ["24.10.0", false],
    ["24.11.1", true],
    ["26.13.1", true],
    ["18.19.1", false],
  ])("reads Vite+'s range for Node %s as %s", (version, met) => {
    expect(satisfies(version, "^22.18.0 || ^24.11.0 || >=26.0.0")).toBe(met);
  });
});

describe("vp run doctor", () => {
  test("names a Node older than the toolchain needs, and vp env on", async () => {
    write(
      "node_modules/vite-plus/package.json",
      JSON.stringify({ engines: { node: ">=99.0.0" }, name: "vite-plus", version: "1.5.0" }),
    );
    expect(await doctor()).toContain(
      `ERROR Node ${process.versions.node} runs vp's tasks, and vite-plus needs Node >=99.0.0: run vp env on, so Vite+ runs its own Node rather than an older one on the PATH, then open a new terminal and run vp run doctor again.`,
    );
  });

  test("names a registry that does not answer", async () => {
    expect(await doctor()).toContain(
      `ERROR the registry at ${closed}, .npmrc's, did not answer (ECONNREFUSED: connect ECONNREFUSED `,
    );
  });

  test("names a certificate Node does not trust, and NODE_EXTRA_CA_CERTS, which then trusts it", async () => {
    const { cert, close, registry } = await selfSignedRegistry();
    try {
      expect(await doctor()).toContain(
        `ERROR Node does not trust the certificate the registry at ${registry} answers with (DEPTH_ZERO_SELF_SIGNED_CERT), as behind a proxy that inspects TLS, so vp install and every Node tool fail: set NODE_EXTRA_CA_CERTS to the proxy's root certificate`,
      );
      expect(await doctor({ NODE_EXTRA_CA_CERTS: cert })).toContain(
        `ok the registry at ${registry}, .npmrc's, answers\n`,
      );
    } finally {
      close();
    }
  });

  test.skipIf(process.platform === "win32")(
    "names the libraries a downloaded Chromium lacks, and install-deps",
    { timeout: 30_000 },
    async () => {
      const browsers = mkdtempSync(path.join(tmpdir(), "basis-ui-doctor-browsers-"));
      // Where Playwright looks for its headless Chromium, as its own error names it.
      const said = spawnSync(
        process.execPath,
        [
          "-e",
          'require("playwright").chromium.launch().catch((error) => console.log(error.message))',
        ],
        {
          cwd: packageRoot,
          encoding: "utf8",
          env: { ...environment, PLAYWRIGHT_BROWSERS_PATH: browsers },
        },
      ).stdout;
      const executable =
        /Executable doesn't exist at (?<file>\S+)/u.exec(said)?.groups?.["file"] ?? "";
      mkdirSync(path.dirname(executable), { recursive: true });
      writeFileSync(
        executable,
        "#!/bin/sh\necho 'chrome-headless-shell: error while loading shared libraries: libnss3.so: cannot open shared object file: No such file or directory' >&2\nexit 127\n",
      );
      chmodSync(executable, 0o755);
      try {
        expect(await doctor({ PLAYWRIGHT_BROWSERS_PATH: browsers })).toMatch(
          /^ERROR Playwright \d+\.\d+\.\d+'s Chromium is installed, but cannot start, since the system lacks libraries it needs \(libnss3\.so\): run sudo vp dlx playwright@\d+\.\d+\.\d+ install-deps chromium, then vp run doctor again\.$/mu,
        );
      } finally {
        rmSync(browsers, { force: true, recursive: true });
      }
    },
  );
});
