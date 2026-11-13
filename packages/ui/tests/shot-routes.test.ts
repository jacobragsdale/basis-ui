/* What `vp run shot` does with a route it cannot trust: one that matches none of the router's paths, whose picture is
 * the page not found, and one that cannot be pictured at all, which leaves the shots of the others. */

import { describe, expect, test } from "vite-plus/test";

import type { ShotEntry } from "#preset/shot-report.ts";
import { shootInTurn } from "#preset/shot-route.ts";
import { unmatchedLine } from "#preset/shot-routes.ts";

/** A route's shot that found nothing. */
const entry = (route: string): ShotEntry => ({
  axe: 0,
  compare: null,
  console: 0,
  files: {
    aria: `.shots${route}.aria.yml`,
    axe: `.shots${route}.axe.txt`,
    console: `.shots${route}.console.txt`,
    diff: null,
    network: `.shots${route}.network.txt`,
    png: `.shots${route}.png`,
  },
  requests: 0,
  route,
});

describe("a route the router has no page for, and one that cannot be pictured", () => {
  const paths = ["/", "/bonds/$security", "/settlements/new/", "/files/$"];

  test("fails a route no path of the router matches, naming the router's paths", () => {
    expect(unmatchedLine("/positons", paths)).toBe(
      "ERROR /positons matches no route of the app's router, so its picture is the page not found: name one of the router's paths, /, /bonds/$security, /settlements/new, /files/$, or add the route to src/routes.ts.",
    );
    expect(unmatchedLine("/bonds/US91282CRF04/coupons", paths)).toContain("matches no route");
  });

  test("passes a route a path matches, with its query, a trailing slash or a splat, and any route with no router to read", () => {
    for (const route of [
      "/",
      "/bonds/US91282CRF04?settle=2026-11-06",
      "/settlements/new/",
      "/files/a/b.csv",
    ]) {
      expect(unmatchedLine(route, paths)).toBeUndefined();
    }
    expect(unmatchedLine("/positons", [])).toBeUndefined();
  });

  test("keeps the shots before and after a route whose load times out, and names it", async () => {
    const taken = await shootInTurn(["/a", "/slow", "/b"], async (route) => {
      if (route === "/slow") {
        throw new Error("page.goto: Timeout 30000ms exceeded.\nCall log: navigating");
      }
      return Promise.resolve({ entry: entry(route), problems: [] });
    });
    expect(taken).toStrictEqual([
      { entry: entry("/a"), problems: [] },
      {
        problems: [
          {
            kind: "route",
            message:
              "ERROR /slow could not be pictured (page.goto: Timeout 30000ms exceeded), and the routes before it were: run vp run shot /slow alone, and if it fails again, read its console and network files or raise --wait for a slow page.",
            route: "/slow",
          },
        ],
      },
      { entry: entry("/b"), problems: [] },
    ]);
  });
});
