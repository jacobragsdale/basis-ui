/* The shot task's arguments and its files' names. Taking a shot itself needs Chromium and a dev server: the example
 * app's `vp run shot /` is how it was checked. */

import { describe, expect, test } from "vite-plus/test";

import { nameOf, optionsOf } from "#preset/shot-options.ts";

describe("optionsOf", () => {
  test("reads a route and the options, defaulting the rest", () => {
    expect(optionsOf(["/positions?book=rates"])).toStrictEqual({
      dark: false,
      density: "compact",
      height: 800,
      route: "/positions?book=rates",
      wait: 500,
      width: 1280,
    });
    expect(
      optionsOf(["--dark", "/", "--width", "390", "--comfortable", "--wait", "2000"]),
    ).toMatchObject({
      dark: true,
      density: "comfortable",
      wait: 2000,
      width: 390,
    });
  });

  test("takes --compact, the default density, for the scripts written when it was not", () => {
    expect(optionsOf(["/", "--compact"])).toMatchObject({ density: "compact" });
  });

  test("takes --wait 0, for a page that needs no time to settle", () => {
    expect(optionsOf(["/", "--wait", "0"])).toMatchObject({ wait: 0 });
    expect(() => optionsOf(["/", "--width", "0"])).toThrow("ERROR --width takes a whole number");
  });

  test("refuses no route, a second route, a word that is neither, and a size that is no whole number", () => {
    expect(() => optionsOf([])).toThrow("ERROR vp run shot needs a route");
    expect(() => optionsOf(["/", "/other"])).toThrow('ERROR "/other" is no route or option');
    expect(() => optionsOf(["positions"])).toThrow('ERROR "positions" is no route or option');
    expect(() => optionsOf(["/", "--width", "wide"])).toThrow("ERROR --width takes a whole number");
    expect(() => optionsOf(["/", "--height"])).toThrow("ERROR --height takes a whole number");
  });
});

describe("nameOf", () => {
  test("names the files by the route's words, an underscore where a slash parts them", () => {
    expect([nameOf("/"), nameOf("/settlements/new"), nameOf("/#/fixed-income?x=1")]).toStrictEqual([
      "home",
      "settlements_new",
      "fixed-income-x-1",
    ]);
  });

  test("names two routes that differ only in a slash apart", () => {
    expect(nameOf("/a/b")).not.toBe(nameOf("/a-b"));
  });
});
