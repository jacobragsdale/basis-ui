// @vitest-environment happy-dom
/* Fixture mode where the browser gives no service worker, as on a page opened over plain HTTP by hostname: it says
 * why, on the page, instead of leaving it blank. */

import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { fixtureModeFailed, startFixtureMode } from "#fixtures/start.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("fixture mode without a service worker", () => {
  test("refuses to start, naming the secure address to open instead", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("location", new URL("http://devbox:20123/positions"));
    await expect(startFixtureMode({ fixtures: [], generated: {}, records: [] })).rejects.toThrow(
      "Fixture mode answers /api with a service worker, which the browser gives only a secure page, and http://devbox:20123 is not one: open http://localhost:20123, or serve the app over HTTPS.",
    );
  });

  test("says so on the page, as text, and in the console", () => {
    const logged: unknown[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args[0]);
    });
    fixtureModeFailed(new Error("<b>No worker</b>"));
    expect(document.body.querySelector("h1")?.textContent).toBe("Fixture mode could not start");
    expect(document.body.querySelector("p")?.textContent).toBe("<b>No worker</b>");
    expect(document.body.querySelector("b")).toBeNull();
    expect(logged).toStrictEqual(["[fixture mode] could not start"]);
  });
});
