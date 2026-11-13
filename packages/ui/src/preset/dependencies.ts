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
  classnames: "classes are merged with cn from @basis/ui",
  clsx: "classes are merged with cn from @basis/ui",
  cn: "classes are merged with cn from @basis/ui",
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
  "tailwind-merge": "classes are merged with cn from @basis/ui",
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

/** A spec that installs a package from somewhere other than the feed, or under another package's name: an alias, a
 * file or link, a git repository, a URL, or GitHub's `owner/repo`. A version, a range, a tag and `workspace:` are
 * the feed's, or basis-ui's own workspace's. */
const elsewhere =
  /^(?:npm:|file:|link:|git(?:\+|:)|github:|gitlab:|bitbucket:|https?:)|^[^@\s:]+\/[^\s:]+$/u;

/** The one line for each dependency of `specs` that is not installed from the feed at a version. */
function specProblems(specs: ReadonlyMap<string, string>): readonly string[] {
  return [...specs]
    .filter(([, spec]) => elsewhere.test(spec))
    .toSorted(([left], [right]) => left.localeCompare(right, "en"))
    .map(
      ([name, spec]) =>
        `ERROR package.json installs ${name} from ${spec}, not from the feed at a version: install it with vp add ${name}@VERSION, at the version the template pins.`,
    );
}

export { allowed, dependencyProblems, rejected, specProblems };
