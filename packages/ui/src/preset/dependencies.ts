/* The packages a basis-ui app may depend on, which the drift check, `vp run sync --check`, holds its package.json to
 * (docs/design.md, Dependencies and the supply chain): a new one is basis-ui's maintainer's to approve, and is added
 * here, so every app may then use it. The libraries the design decided against are refused by name, each with what
 * replaces it, as the lint refuses their imports (lint-bans.ts). */

/** The packages an app may list in `dependencies` or `devDependencies`, the template's and the example's. */
const allowed: ReadonlySet<string> = new Set([
  "@basis/parallax",
  "@basis/ui",
  "@faker-js/faker",
  "@tanstack/react-form",
  "@tanstack/react-query",
  "@tanstack/react-router",
  "@types/react",
  "@types/react-dom",
  "apache-arrow",
  "msw",
  "react",
  "react-dom",
  "typescript",
  "vite-plus",
  "vitest-browser-react",
  "zod",
]);

/** What replaces each library the design decided against, or that @basis/ui's utilities and icons replace. */
const rejected: Readonly<Record<string, string>> = {
  "@hey-api/openapi-ts": "the client is orval's, which vp run client-pull runs",
  "@typescript-eslint/parser": "the lint is Oxlint's, which vp check runs",
  axios: "the API is called through the generated client",
  "big.js": "every number is a double, totalled with sumPrecise from @basis/ui/numbers",
  "bignumber.js": "every number is a double, totalled with sumPrecise from @basis/ui/numbers",
  "date-fns": "dates are Temporal's and @basis/ui/dates'",
  dayjs: "dates are Temporal's and @basis/ui/dates'",
  "decimal.js": "every number is a double, totalled with sumPrecise from @basis/ui/numbers",
  eslint: "the lint is Oxlint's, which vp check runs",
  lodash: "the helpers are @basis/ui/utils' and the native APIs'",
  "lodash-es": "the helpers are @basis/ui/utils' and the native APIs'",
  "lucide-react": "the icons are @basis/ui's, under lucide's names",
  luxon: "dates are Temporal's and @basis/ui/dates'",
  moment: "dates are Temporal's and @basis/ui/dates'",
  prettier: "the formatter is Oxfmt, which vp check runs",
  "react-aria": "the components are @basis/ui's, on Base UI",
  "react-aria-components": "the components are @basis/ui's, on Base UI",
  "react-hook-form": "forms are TanStack Form's, which the React Compiler optimizes",
  recharts: "charts are @basis/parallax's Chart",
  shadcn: "the components are @basis/ui's, which no app copies",
  sonner: "toasts are @basis/ui's toast",
  storybook: "the components' pictures are @basis/ui's gallery's",
  "typescript-eslint": "the lint is Oxlint's, which vp check runs",
  underscore: "the helpers are @basis/ui/utils' and the native APIs'",
};

/** The one line for each of `names`, the app's dependencies, development ones included, that it may not have. */
function dependencyProblems(names: Iterable<string>): readonly string[] {
  return [...new Set(names)].toSorted().flatMap((name) => {
    if (allowed.has(name)) {
      return [];
    }
    const instead = Object.hasOwn(rejected, name) ? rejected[name] : undefined;
    return [
      instead === undefined
        ? `ERROR package.json depends on ${name}, which is not among the packages a basis-ui app may use: remove it with vp remove ${name}, or ask basis-ui's maintainer to add it to @basis/ui's list.`
        : `ERROR package.json depends on ${name}, which basis-ui decided against, since ${instead}: remove it with vp remove ${name}.`,
    ];
  });
}

export { allowed, dependencyProblems, rejected };
