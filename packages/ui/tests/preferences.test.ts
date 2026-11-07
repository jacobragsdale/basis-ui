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
  type Density,
  type ModePreference,
  type Preferences,
} from "../src/index.ts";

// A stand-in for the page's root element: just the parts the preferences touch.
interface FakeRoot {
  readonly classes: Set<string>;
  readonly classList: { toggle(name: string, on: boolean): void };
  readonly style: { colorScheme: string };
  readonly dataset: Record<string, string>;
}

function fakeRoot(): FakeRoot {
  const classes = new Set<string>();
  return {
    classes,
    classList: {
      toggle(name, on) {
        if (on) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
    },
    style: { colorScheme: "" },
    dataset: {},
  };
}

function state(root: FakeRoot): unknown {
  return {
    dark: root.classes.has("dark"),
    colorScheme: root.style.colorScheme,
    density: root.dataset["density"],
  };
}

const modes: readonly ModePreference[] = ["system", "light", "dark"];
const densities: readonly Density[] = ["comfortable", "compact"];
const every: readonly Preferences[] = modes.flatMap((mode) =>
  densities.map((density) => ({ mode, density })),
);

describe("the cookie", () => {
  test.each(every)("round-trips %o", (preferences) => {
    const cookie = serializePreferences(preferences).split(";")[0] ?? "";
    expect(parsePreferences(`other=1; ${cookie}; more=2`)).toEqual(preferences);
  });

  test("falls back to the default when it is missing or holds unknown values", () => {
    expect(parsePreferences("")).toEqual(defaultPreferences);
    expect(parsePreferences(`${preferencesCookie}=sepia.huge`)).toEqual(defaultPreferences);
    expect(parsePreferences(`${preferencesCookie}=dark`)).toEqual({
      mode: "dark",
      density: "comfortable",
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
  const cases = every.flatMap((preferences) =>
    [true, false].map((systemDark) => [preferences, systemDark] as const),
  );

  test.each(cases)("for %o with a dark system: %s", (preferences, systemDark) => {
    const expected = fakeRoot();
    applyPreferences(expected as unknown as HTMLElement, preferences, systemDark);

    const actual = fakeRoot();
    const page = {
      document: {
        cookie: serializePreferences(preferences).split(";")[0] ?? "",
        documentElement: actual,
      },
      matchMedia: () => ({ matches: systemDark }),
    };
    runInNewContext(headScript, page);

    expect(state(actual)).toEqual(state(expected));
  });

  test("and keeps the default when there is no cookie", () => {
    const actual = fakeRoot();
    runInNewContext(headScript, {
      document: { cookie: "", documentElement: actual },
      matchMedia: () => ({ matches: false }),
    });
    expect(state(actual)).toEqual({ dark: false, colorScheme: "light", density: undefined });
  });
});
