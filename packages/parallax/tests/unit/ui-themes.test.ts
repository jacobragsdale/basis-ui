import { themeNames } from "@basis/ui";
import { expect, test } from "vite-plus/test";

// oxlint-disable-next-line import/no-relative-parent-imports -- the end-to-end suites' list of themes is no part of the package to import by name.
import { otherThemes } from "../e2e/ui-themes.ts";

test("the end-to-end screenshots' themes are @basis/ui's, the default aside", () => {
  expect(["default", ...otherThemes]).toStrictEqual(themeNames);
});
