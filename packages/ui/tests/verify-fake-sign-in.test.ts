/* The build stage's refusal of a production build that signs users in with `fakeSignIn`: one ERROR line for each chunk
 * that holds its development key, ending in the fix. The example's verify runs the whole stage. */

import { expect, test } from "vite-plus/test";

import { fakeSignInFindings } from "#preset/verify-build.ts";
import { developmentKeyMark } from "#shell/sign-in.ts";

test("names each chunk that holds fakeSignIn's key, and ends with the fix", () => {
  const [finding, ...rest] = fakeSignInFindings(["assets/index-a1b2.js"]);
  expect(rest).toStrictEqual([]);
  expect(finding?.text).toBe(
    "ERROR the production build's assets/index-a1b2.js signs users in with fakeSignIn, whose development key anyone can read, so its tokens prove nothing (fake-sign-in): sign in with windowsSignIn in production, and fakeSignIn only where import.meta.env.DEV or import.meta.env.MODE === \"fixtures\" says, as the template's src/sign-in.ts does, then run vp run verify --stage build.",
  );
  expect(fakeSignInFindings([])).toStrictEqual([]);
});

test("looks for the key's private part, which no other code holds", () => {
  expect(developmentKeyMark).toMatch(/^[\w-]{43}$/u);
});
