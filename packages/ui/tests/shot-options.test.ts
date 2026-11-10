/* The shot task's arguments and its files' names. Taking a shot itself needs Chromium and a dev server: shot.test.ts
 * and shot-parts.test.ts check its parts in Chromium, and the example app's `vp run shot / --all` the whole. */

import { describe, expect, test } from "vite-plus/test";

import { nameOf, optionsOf } from "#preset/shot-options.ts";

describe(optionsOf, () => {
  test("reads a route and the options, defaulting the rest", () => {
    expect(optionsOf(["/positions?book=rates"])).toStrictEqual({
      all: false,
      compare: undefined,
      density: "compact",
      height: 800,
      json: false,
      mode: "light",
      routes: ["/positions?book=rates"],
      selector: undefined,
      steps: [],
      theme: "default",
      wait: 500,
      width: 1280,
    });
    expect(
      optionsOf([
        "/",
        "--mode",
        "dark",
        "--density=comfortable",
        "--theme",
        "default",
        "--width",
        "390",
        "--wait",
        "2000",
        "--selector",
        "#coupons",
        "--compare",
        "baselines",
        "--json",
      ]),
    ).toMatchObject({
      compare: "baselines",
      density: "comfortable",
      json: true,
      mode: "dark",
      selector: "#coupons",
      wait: 2000,
      width: 390,
    });
  });

  test("takes --dark, --comfortable and --compact, as scripts written before --mode and --density do", () => {
    expect(optionsOf(["/", "--dark", "--comfortable"])).toMatchObject({
      density: "comfortable",
      mode: "dark",
    });
    expect(optionsOf(["/", "--compact"])).toMatchObject({ density: "compact" });
    expect(optionsOf(["/", "--dark", "--mode", "dark"])).toMatchObject({ mode: "dark" });
  });

  test("takes several routes, --all with or without them, and steps for one route", () => {
    expect(optionsOf(["/", "/settlements/new"])).toMatchObject({
      all: false,
      routes: ["/", "/settlements/new"],
    });
    expect(optionsOf(["--all"])).toMatchObject({ all: true, routes: [] });
    expect(optionsOf(["/bonds/US91282CRF04", "--all"])).toMatchObject({
      all: true,
      routes: ["/bonds/US91282CRF04"],
    });
    expect(
      optionsOf(["/settlements/new", "--step", "click:Save", "--step", "press:Enter"]).steps,
    ).toStrictEqual([
      { action: "click", source: "click:Save", target: { name: "Save" } },
      { action: "press", key: "Enter", source: "press:Enter" },
    ]);
  });

  test("takes --wait 0, for a page that needs no time to settle", () => {
    expect(optionsOf(["/", "--wait", "0"])).toMatchObject({ wait: 0 });
  });

  test("refuses each wrong argument with its own line", () => {
    const refusals: readonly (readonly [readonly string[], string])[] = [
      [
        [],
        "ERROR vp run shot needs a route, or --all for every route: run vp run shot ROUTE, such as vp run shot /positions, or vp run shot --all.",
      ],
      [
        ["positions"],
        'ERROR "positions" is no route or option: a route starts with /, such as /positions, and the options are --all, --mode, --density, --theme, --width, --height, --wait, --selector, --step, --compare and --json.',
      ],
      [
        ["/", "--width", "0"],
        "ERROR --width takes a whole number of pixels, 1 or more, such as --width 390.",
      ],
      [
        ["/", "--width", "wide"],
        "ERROR --width takes a whole number of pixels, 1 or more, such as --width 390.",
      ],
      [
        ["/", "--height"],
        "ERROR --height takes a whole number of pixels, 1 or more, such as --height 1000.",
      ],
      [
        ["/", "--wait", "-1"],
        "ERROR --wait takes a whole number of milliseconds, 0 or more, such as --wait 2000.",
      ],
      [["/", "--mode", "dim"], "ERROR --mode takes light or dark, such as --mode dark."],
      [
        ["/", "--density", "--json"],
        "ERROR --density takes compact or comfortable, such as --density comfortable.",
      ],
      [
        ["/", "--theme", "ocean"],
        "ERROR --theme takes the name of a theme @basis/ui ships (default), such as --theme default.",
      ],
      [
        ["/", "--selector"],
        "ERROR --selector takes the CSS selector of the element to picture, such as --selector main or --selector '#coupons'.",
      ],
      [
        ["/", "--compare="],
        "ERROR --compare takes the folder of baselines, such as --compare baselines.",
      ],
      [
        ["/", "--step"],
        "ERROR --step takes a step, such as --step 'click:Save', --step 'type:#amount=100' or --step 'press:Enter'.",
      ],
      [
        ["/", "--dark", "--mode", "light"],
        "ERROR --mode is given twice, as dark and light: give it once.",
      ],
      [
        ["--all", "--step", "click:Save"],
        "ERROR --step acts on one route, and this shot has more: give the route with its steps alone, such as vp run shot /settlements/new --step 'click:Save'.",
      ],
      [
        ["/", "/a", "--step", "click:Save"],
        "ERROR --step acts on one route, and this shot has more: give the route with its steps alone, such as vp run shot /settlements/new --step 'click:Save'.",
      ],
    ];
    for (const [args, line] of refusals) {
      expect(() => optionsOf(args), args.join(" ")).toThrow(
        expect.objectContaining({ message: line }),
      );
    }
  });
});

describe(nameOf, () => {
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

  test("adds the mode, the density and the element when they are not the default", () => {
    const options = { density: "compact", mode: "light", selector: undefined } as const;
    expect(nameOf("/", options)).toBe("home");
    expect(
      nameOf("/positions", { density: "comfortable", mode: "dark", selector: "#coupons" }),
    ).toBe("positions-dark-comfortable--coupons");
    expect(nameOf("/", { ...options, selector: "[data-slot=card]" })).toBe("home--data-slot-card");
  });

  test("adds a theme other than the default after the route, and the default adds none", () => {
    const options = { density: "compact", mode: "dark", selector: undefined } as const;
    expect(nameOf("/positions", { ...options, theme: "default" })).toBe("positions-dark");
    expect(nameOf("/positions", { ...options, theme: "high-contrast" })).toBe(
      "positions-high-contrast-dark",
    );
  });
});
