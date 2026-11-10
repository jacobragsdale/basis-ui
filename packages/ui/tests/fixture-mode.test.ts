/* Fixture mode in `vp dev`, as the preset's plugin gives it: the page that starts fixture mode before the app's entry,
 * the port of the app's own, the fixtures module, and the page served through a real Vite dev server. */

import { once } from "node:events";
import { rmSync } from "node:fs";
import { IncomingMessage, get } from "node:http";
import path from "node:path";
import { text } from "node:stream/consumers";

import { createLogger, createServer, resolveConfig } from "vite-plus";
import type { Plugin, ViteDevServer } from "vite-plus";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { devPort, fixtureModePlugin, rootPath, withFixtureMode } from "#preset/fixture-mode.ts";

import { bondAnswer, example, makeApp, record, removeApp, writeIn } from "./fixture-app.ts";

const page = `<!doctype html>
<html lang="en">
  <head>
    <title>App</title>
    <script src="https://cdn.example/analytics.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

let app = "";

beforeAll(() => {
  app = makeApp({
    ".fixtures/conventions.json": record("conventions", "GET /conventions"),
    "fixtures/a.json": record("conventions", "GET /conventions"),
    "fixtures/b/bond.json": record("bond", "GET /bonds/US91282CRF04", bondAnswer),
    "index.html": page,
    "src/main.tsx": 'document.title = "App";\n',
  });
});

afterAll(() => {
  removeApp(app);
});

describe(withFixtureMode, () => {
  test("starts fixture mode, then imports the page's own module scripts, leaving other scripts alone", () => {
    const html = withFixtureMode(page, app) ?? "";
    expect(html).toContain('<script src="https://cdn.example/analytics.js"></script>');
    expect(html).not.toContain('src="/src/main.tsx"');
    const script = /<script type="module">\n(?<body>[\s\S]*?)<\/script>/u.exec(html)?.groups?.[
      "body"
    ];
    expect(script?.split("\n")).toStrictEqual([
      'import { startFixtureMode } from "@basis/ui/fixtures";',
      'import fixtures from "virtual:basis/fixtures";',
      "const generated = {};",
      "await startFixtureMode({ ...fixtures, generated });",
      'await import("/src/main.tsx");',
      "",
    ]);
  });

  test("imports orval's generated handlers when the app has them", () => {
    expect(withFixtureMode(page, example)).toContain(
      'import * as generated from "/src/api/generated/client.msw.ts";',
    );
  });

  test("leaves a page with no module script of the app's own", () => {
    expect(withFixtureMode("<body><script>1</script></body>", app)).toBeUndefined();
  });
});

interface Resolved {
  readonly plugin: Plugin;
  readonly port: number | undefined;
  readonly include: readonly string[];
}

/** The plugin, as Vite resolves it in `mode` for the app at `root`, with the port given, if any. */
async function resolvedPlugin(
  root: string,
  { liveApi, mode = "development", port }: { liveApi?: string; mode?: string; port?: number } = {},
): Promise<Resolved> {
  const plugin = fixtureModePlugin({ liveApi });
  const config = await resolveConfig(
    {
      configFile: false,
      logLevel: "silent",
      mode,
      plugins: [plugin],
      root,
      ...(port === undefined ? {} : { server: { port } }),
    },
    "serve",
  );
  return { include: config.optimizeDeps.include ?? [], plugin, port: config.server.port };
}

/** Calls a plugin hook, whether Vite would find it as a function or as `{ handler }`. */
function callHook(hook: unknown, ...args: readonly unknown[]): unknown {
  const handler =
    typeof hook === "object" && hook !== null && "handler" in hook ? hook.handler : hook;
  return typeof handler === "function" ? Reflect.apply(handler, undefined, args) : undefined;
}

describe(fixtureModePlugin, () => {
  test("serves vp dev on the app's own port, unless the app or the command line names one, and leaves vp test's", async () => {
    const dev = await resolvedPlugin(app);
    expect(dev.port).toBe(devPort(app));
    const named = await resolvedPlugin(app, { port: 5180 });
    expect(named.port).toBe(5180);
    const tests = await resolvedPlugin(app, { mode: "test" });
    expect(tests.port).not.toBe(devPort(app));
  });

  test("starts fixture mode in vp dev, bundling what its script imports", async () => {
    const fixtureMode = await resolvedPlugin(app);
    expect(fixtureMode.include).toContain("@basis/ui/fixtures");
    expect(callHook(fixtureMode.plugin.transformIndexHtml, page)).toContain("startFixtureMode");
  });

  test("leaves the page alone with BASIS_API_URL, in vp test, and in an app with no API", async () => {
    const live = await resolvedPlugin(app, { liveApi: "http://127.0.0.1:8000" });
    expect(live.include).not.toContain("@basis/ui/fixtures");
    expect(callHook(live.plugin.transformIndexHtml, page)).toBe(page);
    const tests = await resolvedPlugin(app, { mode: "test" });
    expect(callHook(tests.plugin.transformIndexHtml, page)).toBe(page);
    const noApi = await resolvedPlugin(path.join(app, "fixtures"));
    expect(callHook(noApi.plugin.transformIndexHtml, page)).toBe(page);
  });

  test("its fixtures module holds the records and fixtures, and only the fixtures in vp test", async () => {
    const { plugin } = await resolvedPlugin(app);
    const id = callHook(plugin.resolveId, "virtual:basis/fixtures");
    expect(id).toBe("\0virtual:basis/fixtures");
    const code = String(callHook(plugin.load, id));
    expect(code).toMatch(/^export default \{"fixtures":\[\{"file":"fixtures\/a\.json"/u);
    expect(code).toContain('"records":[{"file":".fixtures/conventions.json"');
    const tests = await resolvedPlugin(app, { mode: "test" });
    expect(String(callHook(tests.plugin.load, id))).toContain('"records":[]');
  });

  test("its fixtures module fails with every problem, which Vite shows over the page", async () => {
    const { plugin } = await resolvedPlugin(app);
    writeIn(
      app,
      ".fixtures/broken.json",
      record("conventions", "GET /conventions", { status: 99 }),
    );
    try {
      expect(() => callHook(plugin.load, "\0virtual:basis/fixtures")).toThrow(
        /^ERROR \.fixtures\/broken\.json: response\.status: /u,
      );
    } finally {
      rmSync(path.join(app, ".fixtures/broken.json"));
    }
  });
});

/** The text a GET of `url` answers. */
async function textOf(url: string): Promise<string> {
  const answered: unknown[] = await once(get(url), "response");
  const [response] = answered;
  if (!(response instanceof IncomingMessage)) {
    throw new TypeError(`GET ${url} gave no response.`);
  }
  return text(response);
}

/** `vp dev` in the app, as the plugin serves it, with the lines it prints; the caller closes it. */
async function devServer(): Promise<{ readonly server: ViteDevServer; readonly lines: string[] }> {
  const logger = createLogger("info");
  const lines: string[] = [];
  logger.info = (line: string): void => {
    lines.push(line);
  };
  const server = await createServer({
    cacheDir: path.join(app, "node_modules/.vite"),
    configFile: false,
    customLogger: logger,
    optimizeDeps: { noDiscovery: true },
    plugins: [fixtureModePlugin({ liveApi: undefined })],
    root: app,
  });
  await server.listen();
  server.printUrls();
  return { lines, server };
}

/** The script Vite serves for the first inline module of the page at `address`. */
async function pageScript(address: string): Promise<string> {
  const html = await textOf(address);
  const proxy = /src="(?<url>\/index\.html\?html-proxy[^"]+)"/u.exec(html)?.groups?.["url"] ?? "";
  return textOf(new URL(proxy, address).href);
}

describe("vp dev in fixture mode", () => {
  test("serves the page through Vite with fixture mode's script, and prints what answers /api", async () => {
    const { lines, server } = await devServer();
    try {
      const [address = ""] = server.resolvedUrls?.local ?? [];
      const script = await pageScript(address);
      expect(script).toMatch(/from "\/node_modules\/\.vite\/deps\/@basis_ui_fixtures\.js\?v=\w+"/u);
      expect(script).toContain('from "/@id/__x00__virtual:basis/fixtures"');
      expect(script).toContain('await import("/src/main.tsx")');
      expect(lines.join("\n")).toContain(
        "Fixture mode: /api is answered by 1 record in .fixtures/, then 2 fixtures in fixtures/, then orval's generated handlers.",
      );
    } finally {
      await server.close();
    }
  });

  test("names the app's root at its own path, so vp run shot knows whose vp dev answers on the port", async () => {
    const { server } = await devServer();
    try {
      const [address = ""] = server.resolvedUrls?.local ?? [];
      expect(await textOf(new URL(rootPath, address).href)).toBe(app);
    } finally {
      await server.close();
    }
  });
});
