/* `vp build --mode fixtures`: the app built to answer `/api` from its fixtures with no backend, MSW's worker beside the
 * page, body files copied under `__basis/fixture-body/`, and never a record from `.fixtures/`. */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { build } from "vite-plus";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { fixtureBuildPlugin } from "#preset/fixture-build.ts";

import { makeApp, record, removeApp } from "./fixture-app.ts";

const page = `<!doctype html>
<html lang="en">
  <head><title>App</title></head>
  <body><script type="module" src="/src/main.ts"></script></body>
</html>
`;

const arrow = {
  body_file: "data/coupons.arrows",
  media_type: "application/vnd.apache.arrow.stream",
  status: 200,
};

let app = "";

/** Builds the app in `mode`, quietly. */
async function buildIn(mode: string): Promise<void> {
  await build({
    build: { minify: false },
    configFile: false,
    logLevel: "silent",
    mode,
    plugins: [fixtureBuildPlugin()],
    root: app,
  });
}

/** Every built JavaScript file's text, joined. */
function builtScripts(): string {
  const assets = path.join(app, "dist/assets");
  return readdirSync(assets)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(path.join(assets, name), "utf8"))
    .join("\n");
}

beforeAll(async () => {
  app = makeApp({
    ".fixtures/secret.json": record("conventions", "GET /conventions"),
    "fixtures/coupons.json": record("coupons", "GET /bonds/US91282CRF04/coupons", arrow),
    "fixtures/data/coupons.arrows": "ARROW1",
    "index.html": page,
    "src/main.ts": 'document.title = "Built";\n',
  });
  await buildIn("fixtures");
}, 60_000);

afterAll(() => {
  removeApp(app);
});

describe(fixtureBuildPlugin, () => {
  test("starts fixture mode before the app, with MSW's worker beside the page", () => {
    expect(existsSync(path.join(app, "dist/mockServiceWorker.js"))).toBe(true);
    const scripts = builtScripts();
    expect(scripts).toContain("fixtures/coupons.json");
    expect(scripts).toContain('document.title = "Built"');
  });

  test("copies body files under __basis/fixture-body/, and builds in no record", () => {
    expect(
      readFileSync(
        path.join(app, "dist/__basis/fixture-body/fixtures/data/coupons.arrows"),
        "utf8",
      ),
    ).toBe("ARROW1");
    expect(builtScripts()).not.toContain(".fixtures/secret.json");
  });

  test("leaves an ordinary build alone", async () => {
    await buildIn("production");
    expect(existsSync(path.join(app, "dist/mockServiceWorker.js"))).toBe(false);
    expect(builtScripts()).not.toContain("fixtures/coupons.json");
  });
});
