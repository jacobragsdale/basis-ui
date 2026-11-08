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
import type { Density, ModePreference, Preferences, PreferencesRoot } from "#index.ts";

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
const every: readonly Preferences[] = modes.flatMap((mode) =>
  densities.map((density) => ({ density, mode })),
);

/** Each preferences' name in a test title: the cookie's value, such as `dark.compact`. */
const named = every.map(
  (preferences) => [`${preferences.mode}.${preferences.density}`, preferences] as const,
);

describe("the cookie", () => {
  test.each(named)("round-trips %s", (_name, preferences) => {
    const cookie = serializePreferences(preferences).split(";")[0] ?? "";
    expect(parsePreferences(`other=1; ${cookie}; more=2`)).toEqual(preferences);
  });

  test("falls back to the default when it is missing or holds unknown values", () => {
    expect(parsePreferences("")).toEqual(defaultPreferences);
    expect(parsePreferences(`${preferencesCookie}=sepia.huge`)).toEqual(defaultPreferences);
    expect(parsePreferences(`${preferencesCookie}=dark`)).toEqual({
      density: "compact",
      mode: "dark",
    });
    expect(defaultPreferences.density).toBe("compact");
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
    expect(state(actual)).toEqual({ colorScheme: "light", dark: false, density: "compact" });
  });
});
