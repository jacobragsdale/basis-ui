/* Which of several cookies of the preferences' name a page reads: a browser lists cookies of one path oldest first
 * (RFC 6265, 5.4), so an app that names no shared domain marks the cookie it keeps for itself, and reads it first. */

import { expect, test } from "vite-plus/test";

import {
  defaultPreferences,
  parsePreferences,
  preferencesCookie,
  serializePreferences,
} from "#index.ts";

test("prefers the cookie the app keeps for itself, whichever the browser lists first", () => {
  const own = "light.comfortable.reduced.default.host";
  const ownFirst = `${preferencesCookie}=${own}; ${preferencesCookie}=dark.compact.full.default`;
  const sharedFirst = `${preferencesCookie}=dark.compact.full.default; ${preferencesCookie}=${own}`;
  const expected = { density: "comfortable", mode: "light", motion: "reduced", theme: "default" };
  expect(parsePreferences(ownFirst)).toStrictEqual(expected);
  expect(parsePreferences(sharedFirst)).toStrictEqual(expected);
});

test("marks the cookie the app keeps for itself, and not the shared one", () => {
  expect(serializePreferences(defaultPreferences)).toContain(
    `${preferencesCookie}=system.compact.full.default.host;`,
  );
  expect(serializePreferences(defaultPreferences, { domain: "apps.example.com" })).toContain(
    `${preferencesCookie}=system.compact.full.default;`,
  );
});
