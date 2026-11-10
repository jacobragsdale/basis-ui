/* Stand-ins for the page that the preferences tests share: its root element, and what the preferences put on it. */

import type { PreferencesRoot } from "#index.ts";

// A stand-in for the page's root element: just the parts the preferences touch.
interface FakeRoot extends PreferencesRoot {
  readonly classes: Set<string>;
}

/** A root element with no window. */
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

/** What the preferences put on `root`. */
function state(root: FakeRoot): unknown {
  return {
    colorScheme: root.style.colorScheme,
    dark: root.classes.has("dark"),
    density: root.dataset["density"],
    motion: root.dataset["motion"],
    theme: root.dataset["theme"],
  };
}

export { fakeRoot, state };
export type { FakeRoot };
