import { runInNewContext } from "node:vm";

import { describe, expect, test } from "vite-plus/test";

import {
  applyPreferences,
  defaultPreferences,
  headScript,
  parsePreferences,
  preferencesCookie,
  resolveMode,
  serializePreferences,
} from "#index.ts";
import type { Density, ModePreference, Motion, Preferences, PreferencesRoot } from "#index.ts";

// A stand-in for the page's root element: just the parts the preferences touch.
interface FakeRoot extends PreferencesRoot {
  readonly classes: Set<string>;
}

function fakeRoot(): FakeRoot {
  const classes = new Set<string>();
  return {
    classList: {
      toggle: (token: string, force?: boolean): boolean => {
        const on = force ?? !classes.has(token);
        if (on) {
          classes.add(token);
        } else {
          classes.delete(token);
        }
        return on;
      },
    },
    classes,
    dataset: {},
    style: { colorScheme: "" },
  };
}

function state(root: FakeRoot): unknown {
  return {
    colorScheme: root.style.colorScheme,
    dark: root.classes.has("dark"),
    density: root.dataset["density"],
    motion: root.dataset["motion"],
  };
}

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
const every: readonly Preferences[] = modes.flatMap((mode) =>
  densities.flatMap((density) => motions.map((motion) => ({ density, mode, motion }))),
);

/** Each preferences' name in a test title: the cookie's value, such as `dark.compact.full`. */
const named = every.map(
  (preferences) =>
    [`${preferences.mode}.${preferences.density}.${preferences.motion}`, preferences] as const,
);

describe("the cookie", () => {
  test.each(named)("round-trips %s", (_name, preferences) => {
    const cookie = serializePreferences(preferences).split(";")[0] ?? "";
    expect(parsePreferences(`other=1; ${cookie}; more=2`)).toEqual(preferences);
  });

  test("falls back to the default when it is missing or holds unknown values", () => {
    expect(parsePreferences("")).toEqual(defaultPreferences);
    expect(parsePreferences(`${preferencesCookie}=sepia.huge.still`)).toEqual(defaultPreferences);
    expect(parsePreferences(`${preferencesCookie}=dark`)).toEqual({
      density: "compact",
      mode: "dark",
      motion: "full",
    });
    expect(defaultPreferences.density).toBe("compact");
    expect(defaultPreferences.motion).toBe("full");
  });

  test("reads a cookie written before the motion was, of the mode and density alone, as full motion", () => {
    expect(parsePreferences(`${preferencesCookie}=light.comfortable`)).toEqual({
      density: "comfortable",
      mode: "light",
      motion: "full",
    });
  });

  test("names the shared parent domain only when the app gives one", () => {
    expect(serializePreferences(defaultPreferences)).not.toContain("Domain=");
    expect(serializePreferences(defaultPreferences, { domain: "apps.example.com" })).toContain(
      "Domain=apps.example.com",
    );
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
    });
  });

  test.each([true, false])(
    "and with a cookie written before the motion was, as full motion, with a dark system: %s",
    (systemDark) => {
      const cookie = `${preferencesCookie}=dark.comfortable`;
      const expected = fakeRoot();
      applyPreferences(expected, parsePreferences(cookie), systemDark);
      const actual = fakeRoot();
      runInNewContext(headScript, page(cookie, actual, systemDark));
      expect(state(actual)).toEqual(state(expected));
    },
  );
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

const light: Preferences = { density: "comfortable", mode: "light", motion: "full" };

describe("a change of preferences holds transitions off until it is drawn", () => {
  test.each([
    ["mode", { ...light, mode: "dark" }],
    ["density", { ...light, density: "compact" }],
    ["motion", { ...light, motion: "reduced" }],
  ] as const)("a change of %s sets data-switching for two frames", (_name, changed) => {
    expect(holdsAcrossFrames(light, changed)).toStrictEqual(["1", "1", undefined]);
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
