import { runInNewContext } from "node:vm";

import { describe, expect, test } from "vite-plus/test";

import { themeChoices } from "#components/theme-choices.ts";
import {
  applyPreferences,
  defaultPreferences,
  headScript,
  parsePreferences,
  preferencesCookie,
  resolveMode,
  serializePreferences,
  themeNames,
} from "#index.ts";
import type { Density, ModePreference, Motion, Preferences, ThemeName } from "#index.ts";
import { cookieDomain } from "#theme/preferences.ts";

import { fakeRoot, state } from "./preferences-fakes.ts";
import type { FakeRoot } from "./preferences-fakes.ts";

/** The globals the head script reads: the page's cookie and root element, and the operating system's mode. */
function page(cookie: string, root: FakeRoot, systemDark: boolean): object {
  return {
    document: { cookie, documentElement: root },
    matchMedia: (): { readonly matches: boolean } => ({ matches: systemDark }),
  };
}

const modes: readonly ModePreference[] = ["system", "light", "dark"];
const densities: readonly Density[] = ["comfortable", "compact"];
const motions: readonly Motion[] = ["full", "reduced"];
const themes: readonly ThemeName[] = themeNames;
const every: readonly Preferences[] = modes.flatMap((mode) =>
  densities.flatMap((density) =>
    motions.flatMap((motion) => themes.map((theme) => ({ density, mode, motion, theme }))),
  ),
);

/** Each preferences' name in a test title: the cookie's value, such as `dark.compact.full.default`. */
const named = every.map(
  (preferences) =>
    [
      [preferences.mode, preferences.density, preferences.motion, preferences.theme].join("."),
      preferences,
    ] as const,
);

describe("the cookie", () => {
  test.each(named)("round-trips %s", (_name, preferences) => {
    const cookie = serializePreferences(preferences).split(";")[0] ?? "";
    expect(parsePreferences(`other=1; ${cookie}; more=2`)).toEqual(preferences);
  });

  test("falls back to the default when it is missing or holds unknown values", () => {
    expect(parsePreferences("")).toEqual(defaultPreferences);
    expect(parsePreferences(`${preferencesCookie}=sepia.huge.still.neon`)).toEqual(
      defaultPreferences,
    );
    expect(parsePreferences(`${preferencesCookie}=dark`)).toEqual({
      ...defaultPreferences,
      mode: "dark",
    });
    expect(defaultPreferences).toStrictEqual({
      density: "compact",
      mode: "system",
      motion: "full",
      theme: "default",
    });
  });

  test("reads a cookie written before the motion or the theme was as full motion and the default theme", () => {
    expect(parsePreferences(`${preferencesCookie}=light.comfortable`)).toEqual({
      density: "comfortable",
      mode: "light",
      motion: "full",
      theme: "default",
    });
    expect(parsePreferences(`${preferencesCookie}=dark.compact.reduced`)).toEqual({
      density: "compact",
      mode: "dark",
      motion: "reduced",
      theme: "default",
    });
  });

  test("reads a theme no longer shipped as the default, keeping the rest", () => {
    expect(parsePreferences(`${preferencesCookie}=dark.comfortable.reduced.retired`)).toEqual({
      density: "comfortable",
      mode: "dark",
      motion: "reduced",
      theme: "default",
    });
  });

  test("the default theme is the generator's first", () => {
    expect(defaultPreferences.theme).toBe(themeNames[0]);
  });

  test("names the shared parent domain only when the app gives one", () => {
    expect(serializePreferences(defaultPreferences)).not.toContain("Domain=");
    expect(serializePreferences(defaultPreferences, { domain: "apps.example.com" })).toContain(
      "Domain=apps.example.com",
    );
  });

  test("takes the shared domain only on a host that is it or under it, where a browser accepts it", () => {
    expect(cookieDomain("apps.example.com", "positions.apps.example.com")).toBe("apps.example.com");
    expect(cookieDomain("apps.example.com", "apps.example.com")).toBe("apps.example.com");
    expect(cookieDomain(".Apps.Example.com", "Positions.apps.example.com")).toBe(
      "apps.example.com",
    );
    expect(cookieDomain("apps.example.com", "localhost")).toBeUndefined();
    expect(cookieDomain("apps.example.com", "badapps.example.com")).toBeUndefined();
    expect(cookieDomain(undefined, "positions.apps.example.com")).toBeUndefined();
  });
});

test("system mode follows the operating system; light and dark ignore it", () => {
  expect(resolveMode("system", true)).toBe("dark");
  expect(resolveMode("system", false)).toBe("light");
  expect(resolveMode("light", true)).toBe("light");
  expect(resolveMode("dark", false)).toBe("dark");
});

describe("the head script agrees with applyPreferences", () => {
  const cases = named.flatMap(([name, preferences]) =>
    [true, false].map((systemDark) => [name, systemDark, preferences] as const),
  );

  test.each(cases)("for %s with a dark system: %s", (_name, systemDark, preferences) => {
    const expected = fakeRoot();
    applyPreferences(expected, preferences, systemDark);

    const actual = fakeRoot();
    const cookie = serializePreferences(preferences).split(";")[0] ?? "";
    runInNewContext(headScript, page(cookie, actual, systemDark));

    expect(state(actual)).toEqual(state(expected));
  });

  test("and keeps the default when there is no cookie", () => {
    const actual = fakeRoot();
    runInNewContext(headScript, page("", actual, false));
    expect(state(actual)).toEqual({
      colorScheme: "light",
      dark: false,
      density: "compact",
      motion: undefined,
      theme: "default",
    });
  });

  /* Cookies that are not the user menu's latest: older, shorter values, a theme no longer shipped, values no build
   * wrote, and the cookie among others, one with a name that ends in the cookie's. */
  const odd = [
    `${preferencesCookie}=dark.comfortable`,
    `${preferencesCookie}=light.compact.reduced`,
    `${preferencesCookie}=dark.comfortable.reduced.retired`,
    `${preferencesCookie}=dark.compact.full.Default`,
    `${preferencesCookie}=dark`,
    `${preferencesCookie}=sepia.huge.still.neon`,
    `${preferencesCookie}=`,
    `${preferencesCookie}=..reduced.default`,
    `x${preferencesCookie}=dark.comfortable; other=1`,
    `other=1; ${preferencesCookie}=dark.comfortable.reduced.default; more=2`,
    `${preferencesCookie}=light.comfortable; ${preferencesCookie}=dark.compact`,
  ];
  const oddCases = odd.flatMap((cookie) =>
    [true, false].map((systemDark) => [cookie, systemDark] as const),
  );

  test.each(oddCases)("and for the cookies %j with a dark system: %s", (cookie, systemDark) => {
    const expected = fakeRoot();
    applyPreferences(expected, parsePreferences(cookie), systemDark);
    const actual = fakeRoot();
    runInNewContext(headScript, page(cookie, actual, systemDark));
    expect(state(actual)).toEqual(state(expected));
  });

  test("and names every shipped theme, in the generator's order", () => {
    expect(headScript).toContain(`const themes = ${JSON.stringify(themeNames)};`);
  });
});

/** A root element whose window runs its animation frames when the test calls `frame`. */
function rootInWindow(): { readonly root: FakeRoot; readonly frame: () => void } {
  let frames: FrameRequestCallback[] = [];
  const root: FakeRoot = {
    ...fakeRoot(),
    ownerDocument: {
      defaultView: {
        requestAnimationFrame: (draw: FrameRequestCallback): number => frames.push(draw),
      },
    },
  };
  const frame = (): void => {
    const due = frames;
    frames = [];
    for (const draw of due) {
      draw(0);
    }
  };
  return { frame, root };
}

/** What `data-switching` holds after each of three frames from a change from `from` to `to`, once `from` is drawn. */
function holdsAcrossFrames(from: Preferences, to: Preferences): (string | undefined)[] {
  const { root, frame } = rootInWindow();
  applyPreferences(root, from, false);
  frame();
  frame();
  applyPreferences(root, to, false);
  return [0, 1, 2].map((drawn) => {
    if (drawn > 0) {
      frame();
    }
    return root.dataset["switching"];
  });
}

const light: Preferences = {
  density: "comfortable",
  mode: "light",
  motion: "full",
  theme: "default",
};

describe("a change of preferences holds transitions off until it is drawn", () => {
  test.each([
    ["mode", { ...light, mode: "dark" }],
    ["density", { ...light, density: "compact" }],
    ["motion", { ...light, motion: "reduced" }],
  ] as const)("a change of %s sets data-switching for two frames", (_name, changed) => {
    expect(holdsAcrossFrames(light, changed)).toStrictEqual(["1", "1", undefined]);
  });

  test("a change of theme, from one the page shows, sets data-switching for two frames", () => {
    const { root, frame } = rootInWindow();
    root.dataset["theme"] = "high-contrast";
    applyPreferences(root, light, false);
    const held = [root.dataset["switching"]];
    frame();
    frame();
    held.push(root.dataset["switching"]);
    expect([held, root.dataset["theme"]]).toStrictEqual([["1", undefined], "default"]);
  });

  test("applying what is already shown holds nothing, so a running transition, such as the sidebar's, carries on", () => {
    expect(holdsAcrossFrames(light, light)).toStrictEqual([undefined, undefined, undefined]);
  });

  test("a second change while the first is held is held its own two frames", () => {
    const { root, frame } = rootInWindow();
    applyPreferences(root, light, false);
    frame();
    applyPreferences(root, { ...light, mode: "dark" }, false);
    frame();
    expect(root.dataset["switching"]).toBe("2");
    frame();
    expect(root.dataset["switching"]).toBeUndefined();
  });

  test("the reduced motion sets data-motion, which the theme stops every transition and animation under", () => {
    const { root } = rootInWindow();
    applyPreferences(root, { ...light, motion: "reduced" }, false);
    expect(root.dataset["motion"]).toBe("reduced");
    applyPreferences(root, light, false);
    expect(root.dataset["motion"]).toBeUndefined();
  });
});

describe("the theme on the page", () => {
  test("data-theme always names the theme, the default's too, as data-density names the density", () => {
    const root = fakeRoot();
    applyPreferences(root, light, false);
    expect(root.dataset["theme"]).toBe("default");
  });
});

describe("the user menu's themes", () => {
  test("hides the choice while one theme ships, since a choice of one is no choice", () => {
    expect(themeChoices(["default"])).toStrictEqual([]);
  });

  test("offers every theme in the generator's order, by its name in words", () => {
    expect(themeChoices(["default", "dense-dark", "high-contrast"])).toStrictEqual([
      ["default", "Default"],
      ["dense-dark", "Dense dark"],
      ["high-contrast", "High contrast"],
    ]);
  });
});
