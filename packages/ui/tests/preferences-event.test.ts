// The event applyPreferences announces a change with, which canvases, such as parallax's, read their tokens again on.

import { expect, test } from "vite-plus/test";

import { applyPreferences, themeChangeEvent } from "#index.ts";
import type { Preferences } from "#index.ts";

import { fakeRoot } from "./preferences-fakes.ts";
import type { FakeRoot } from "./preferences-fakes.ts";

const light: Preferences = {
  density: "comfortable",
  mode: "light",
  motion: "full",
  theme: "default",
};

test(`a change dispatches ${themeChangeEvent} on the root, which canvases read their tokens again on; applying what is shown dispatches none`, () => {
  const events: string[] = [];
  const root: FakeRoot = {
    ...fakeRoot(),
    dispatchEvent: (event) => {
      events.push(`${event.type} ${String(event.bubbles)}`);
      return true;
    },
  };
  applyPreferences(root, light, false);
  applyPreferences(root, light, false);
  applyPreferences(root, { ...light, density: "compact" }, false);
  expect(events).toStrictEqual([`${themeChangeEvent} true`, `${themeChangeEvent} true`]);
});
