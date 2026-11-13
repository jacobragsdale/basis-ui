/* The packages an app's package.json may not list, each refused by name with what replaces it: here, the class-merging
 * helpers, since `cn` is @basis/ui's own. The drift check's run over a whole app is in drift-check.test.ts. */

import { expect, test } from "vite-plus/test";

import { dependencyProblems } from "#preset/dependencies.ts";

test.each(["classnames", "clsx", "cn", "tailwind-merge"])(
  "refuses %s by name, with cn from @basis/ui as the fix",
  (name) => {
    expect(dependencyProblems([name])).toStrictEqual([
      `ERROR package.json depends on ${name}, which basis-ui decided against, since classes are merged with cn from @basis/ui: remove it with vp remove ${name}.`,
    ]);
  },
);
