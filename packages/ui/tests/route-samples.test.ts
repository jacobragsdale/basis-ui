/* The pages `checkRoutes` opens: each route of the router once, and a route with a parameter at the sample its params
 * give it, or a fixture's, or skipped with a line that says how to give one. */

import { describe, expect, test } from "vite-plus/test";

import { loadFixtureFiles } from "#fixtures/load.ts";
import { routeSamples, skippedLine } from "#testing/route-samples.ts";

/** A fixture of `GET path` answering `status`. */
function fixture(path: string, status: number): Record<string, unknown> {
  return {
    format: "basis-ui-fixture/1",
    operation_id: "bond",
    recorded_at: "2026-11-07T12:00:00Z",
    request: { method: "GET", path },
    response: { status },
  };
}

const { fixtures } = loadFixtureFiles("fixture", {
  "fixtures/bond-US0000000000.json": fixture("/bonds/US0000000000", 404),
  "fixtures/bond-US91282CRF04-coupons.json": fixture("/bonds/US91282CRF04/coupons", 200),
});

describe("the pages checkRoutes opens", () => {
  const paths = ["/", "/bonds/$security", "/books/$book/trades/$", "/trades/"];

  test("opens a route with a parameter at the first fixture of a GET answered with a 2xx whose path it begins", () => {
    expect(routeSamples(paths, { fixtures })).toStrictEqual([
      { path: "/", route: "/" },
      {
        from: "fixtures/bond-US91282CRF04-coupons.json",
        path: "/bonds/US91282CRF04",
        route: "/bonds/$security",
      },
      { line: skippedLine("/books/$book/trades/$"), route: "/books/$book/trades/$" },
      { path: "/trades", route: "/trades" },
    ]);
  });

  test("else opens it at a fixture whose operation takes a path parameter of each name the route's does", () => {
    const parameters = { "fixtures/bond-US91282CRF04-coupons.json": { security: "US91282CRF04" } };
    expect(routeSamples(["/bond-terms/$security"], { fixtures, parameters })).toStrictEqual([
      {
        from: "fixtures/bond-US91282CRF04-coupons.json",
        path: "/bond-terms/US91282CRF04",
        route: "/bond-terms/$security",
      },
    ]);
  });

  test("takes a sample from params, and says which parameter a sample lacks", () => {
    const params = {
      "/bonds/$security": { security: "US 1" },
      "/books/$book/trades/$": { book: "rates" },
    };
    expect(routeSamples(paths, { fixtures }, params).slice(1, 3)).toStrictEqual([
      { from: "checkRoutes' params", path: "/bonds/US%201", route: "/bonds/$security" },
      {
        problem:
          'ERROR /books/$book/trades/$: checkRoutes\' params give it no sample it can be opened at: give a value for each of its parameters, "book", "_splat".',
        route: "/books/$book/trades/$",
      },
    ]);
  });

  test("a route skipped says how to give it a sample", () => {
    expect(skippedLine("/books/$book/trades/$")).toBe(
      'skipped /books/$book/trades/$, which takes a parameter no fixture in fixtures/ gives: add a fixture of a GET its page makes, or name a sample in checkRoutes\' params, as checkRoutes(routeTree, { params: { "/books/$book/trades/$": { book: "VALUE", _splat: "VALUE" } } }).',
    );
  });
});
