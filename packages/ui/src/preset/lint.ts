/* The Oxlint configuration every basis-ui repo runs: the design's strictest settings, as spike 0.1 settled them
 * (docs/spikes/vite-plus.md), with the maintainer's 2026-11-07 changes for rules that banned plain language features
 * or forced file splits: `eslint/no-magic-numbers`, `eslint/no-ternary`, `eslint/sort-imports`,
 * `import/max-dependencies`, `oxc/no-optional-chaining`, `react/jsx-max-depth` and `react/no-multi-comp`, and the
 * three rules for test files; and, the same day, five rules that obstructed basis-ui's own code without catching a
 * bug: `eslint/capitalized-comments`, `eslint/sort-keys`, `eslint/id-length`,
 * `unicorn/no-useless-promise-resolve-reject` and `eslint/max-lines-per-function` in tests; and on 2026-11-09 six limits
 * loosened in app code, and the checks only app code has, which basis-ui's own code takes as `libraryLimits`. Every
 * rule turned off or loosened has its reason on the line above it, because `eslint/no-inline-comments` rejects a
 * comment at the end of a line. */

import { fileURLToPath } from "node:url";
import type { OxlintConfig } from "vite-plus/lint";

import {
  bannedImports,
  bannedPatterns,
  bannedRounding,
  browserOnly,
  browserTestImports,
  generatedImports,
} from "./lint-bans.ts";
import {
  arbitraryValue,
  inlineStyle,
  rawColour,
  restyleContracts,
  restyleFallback,
  unknownClass,
} from "./lint-messages.ts";

type Rules = NonNullable<OxlintConfig["rules"]>;

// OKLCH's channels are l, c and h, coordinates x and y, a counter i; Oxfmt unquotes keys the rule would accept.
const shortNames = ["c", "h", "i", "l", "x", "y"];
// -1, 0, 1, 2 and 100 read as themselves; other numbers still need a name.
const plainNumbers = [-1, 0, 1, 2, 100];

/** The six limits as basis-ui's own code keeps them, and the checks only an app has, off, since its code is what they
 * send an app to: the root vite.config.ts sets them for all but its apps, packages/example and packages/consumer. */
const libraryLimits: Rules = {
  "basis/no-as-child": "off",
  "basis/no-hand-rounding": "off",
  "basis/no-suppressions": "off",
  "basis/theme-classes": "off",
  "typescript/ban-ts-comment": "error",
  "typescript/prefer-ts-expect-error": "error",
  "basis/no-magic-numbers": "off",
  "eslint/complexity": "error",
  "eslint/id-length": ["error", { exceptions: shortNames }],
  "eslint/max-lines-per-function": "error",
  "eslint/max-params": "error",
  "eslint/no-magic-numbers": ["error", { ignore: plainNumbers }],
  "typescript/explicit-function-return-type": "error",
};

/* The six limits in app code, loosened by the maintainer's choice on 2026-11-09: a table page failed all six without a
 * fault among them (packages/consumer/src/positions.tsx), and each failure costs an agent a round. */
const appLimits: Rules = {
  // A page's JSX is most of its lines once formatted; 200 lines of code, blanks and comments aside, is still too many.
  "eslint/max-lines-per-function": [
    "error",
    { max: 200, skipBlankLines: true, skipComments: true },
  ],
  // Every `&&` and ternary a page renders by counts; 30 still stops a function that decides too much.
  "eslint/complexity": ["error", { max: 30 }],
  // A filter of a row by three choices takes four; past four, an options object reads better.
  "eslint/max-params": ["error", { max: 4 }],
  // Also a and b, a comparator's two sides; e, an event; k and v, an entry's key and value; _, a parameter unused.
  "eslint/id-length": ["error", { exceptions: [...shortNames, "_", "a", "b", "e", "k", "v"] }],
  // `basis/no-magic-numbers` is the same rule, except that a number inside JSX may stand as itself.
  "eslint/no-magic-numbers": "off",
  "basis/no-magic-numbers": "error",
  // A handler's or a local helper's type is inferred; `explicit-module-boundary-types` still types every export.
  "typescript/explicit-function-return-type": "off",
  /* The holes probes found open, closed in app code (lint-plugin.ts): every network API, src/api's `fetch` too;
   * rounding by hand; a comment that turns a check off, but one suppressions.ts allows; Radix's asChild; and a plain
   * element's dark: variant, !important, selector, filter, black or white, or class built at run time. */
  "basis/no-as-child": "error",
  "basis/no-fetch": "error",
  "basis/no-hand-rounding": "error",
  "basis/no-suppressions": "error",
  "basis/theme-classes": "error",
  // `basis/no-suppressions` refuses every `@ts-` directive; these two would send an app from one to another.
  "typescript/ban-ts-comment": "off",
  "typescript/prefer-ts-expect-error": "off",
};

// Every built-in plugin the design names. `eslint` is implicit in Oxlint 1.91; listing it changes nothing.
const corePlugins: NonNullable<OxlintConfig["plugins"]> = [
  "eslint",
  "typescript",
  "react",
  "jsx-a11y",
  "unicorn",
  "import",
  "promise",
  "oxc",
];

/** The lint block a basis-ui repo's `vite.config.ts` uses, through `basisPreset()`. */
const lint: OxlintConfig = {
  categories: {
    correctness: "error",
    nursery: "off",
    pedantic: "error",
    perf: "error",
    restriction: "error",
    style: "error",
    suspicious: "error",
  },
  // The generated client is rewritten by `vp run client-pull`, and checked by `vp run client-check` rather than by lint.
  ignorePatterns: ["dist/**", "**/src/api/generated/**"],
  jsPlugins: [
    // Ships with Vite+: `vite-plus/prefer-vite-plus-imports`.
    { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
    // Resolved from this package, so an app needs no direct dependency on @shadcn/lint.
    { name: "shadcn", specifier: fileURLToPath(import.meta.resolve("@shadcn/lint")) },
    // The preset's own rules, whose messages name their fix (lint-plugin.ts).
    {
      name: "basis",
      specifier: fileURLToPath(
        new URL(
          import.meta.url.endsWith(".ts") ? "lint-plugin.ts" : "lint-plugin.mjs",
          import.meta.url,
        ),
      ),
    },
  ],
  options: {
    denyWarnings: true,
    reportUnusedDisableDirectives: "error",
    typeAware: true,
    typeCheck: true,
  },
  overrides: [
    {
      /* The client layer: the app's `src/api`, which imports the generated client to re-export it. The libraries' bans
       * still hold, and `basis/no-fetch` too. It comes before the tests' overrides, since the last override that
       * matches a file sets a rule, so a test in `src/api` keeps the tests' bans. */
      files: ["**/src/api/**"],
      rules: {
        "eslint/no-restricted-imports": [
          "error",
          { paths: bannedImports, patterns: bannedPatterns },
        ],
      },
    },
    {
      // The vitest plugin's rules, such as `vitest/require-hook`, also fire on app code, so only tests get it.
      files: ["**/*.test.ts", "**/*.test.tsx"],
      plugins: [...corePlugins, "vitest"],
      rules: {
        // A test's inputs and expected values are its literals; naming each one hides what the test checks.
        "eslint/no-magic-numbers": "off",
        "basis/no-magic-numbers": "off",
        // A `describe` callback counts as one function, so a full suite would split into many.
        "eslint/max-lines-per-function": "off",
        /* The maintainer's choice: Vitest's default timeout applies, and a test that asserts nothing fails its own
         * expectations rather than needing `expect.hasAssertions()`. */
        "vitest/prefer-expect-assertions": "off",
        "vitest/require-test-timeout": "off",
        // A test measures pixels and builds expected text, so it may round; Vitest's browser API waits for its files.
        "eslint/no-restricted-properties": [
          "error",
          { message: browserOnly, object: "expect", property: "element" },
        ],
        "eslint/no-restricted-imports": [
          "error",
          {
            paths: [...bannedImports, ...browserTestImports],
            patterns: [...bannedPatterns, generatedImports],
          },
        ],
      },
    },
    {
      // A test that needs a real browser, which only the browser run runs, may use Vitest's browser API.
      files: ["**/*.browser.test.ts", "**/*.browser.test.tsx"],
      rules: {
        "eslint/no-restricted-imports": [
          "error",
          { paths: bannedImports, patterns: [...bannedPatterns, generatedImports] },
        ],
        "eslint/no-restricted-properties": "off",
      },
    },
    {
      // Oxlint loads a JS plugin from its module's default export.
      files: ["**/vite.config.ts", "**/preset/lint-plugin.ts"],
      rules: {
        // Vite loads its configuration from the file's default export.
        "import/no-default-export": "off",
      },
    },
  ],
  plugins: corePlugins,
  rules: {
    // It checks every line of a `//` comment, so wrapped sentences fail, and no comment may start lowercase.
    "eslint/capitalized-comments": "off",
    // Conflicts with `react/function-component-definition`, which wants components as function declarations.
    "eslint/func-style": "off",
    // With `import/consistent-type-specifier-style`, a module's types and values arrive in two imports.
    "eslint/no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
    // Its help for `fetch`, to use a local variable instead of the global, contradicts `basis/no-fetch`'s.
    "eslint/no-restricted-globals": "off",
    /* Outside the client layer, the generated files are banned, as are the libraries @basis/ui replaces and those
     * the design decided against. */
    "eslint/no-restricted-imports": [
      "error",
      { paths: bannedImports, patterns: [...bannedPatterns, generatedImports] },
    ],
    // Only the number and date components and parallax round and format, once, for display.
    "eslint/no-restricted-properties": ["error", ...bannedRounding],
    // A ternary is often the clearest conditional render; `eslint/no-nested-ternary` still forbids nesting.
    "eslint/no-ternary": "off",
    // With `unicorn/no-typeof-undefined` and `eslint/no-void`, nothing could test for undefined.
    "eslint/no-undefined": "off",
    // Conflicts with `eslint/sort-vars`, which would reorder declarations that depend on each other.
    "eslint/one-var": "off",
    // Conflicts with `typescript/promise-function-async`; `typescript/require-await` is the type-aware version.
    "eslint/require-await": "off",
    // Sorting by the first imported name, across blank lines, prevents grouping imports by origin.
    "eslint/sort-imports": "off",
    // Order is meaning in data: a theme's tokens are its CSS order, a field's suffixes the order its errors name them.
    "eslint/sort-keys": "off",
    // A page that composes many components imports more than ten modules.
    "import/max-dependencies": ["error", { max: 20 }],
    // Conflicts with `import/no-default-export`: no module could export anything.
    "import/no-named-export": "off",
    // Allows the stylesheet imports Vite bundles.
    "import/no-unassigned-import": ["error", { allow: ["**/*.css"] }],
    // Conflicts with `import/no-default-export`.
    "import/prefer-default-export": "off",
    // Declaration files such as vite-env.d.ts stay scripts; `unicorn/require-module-specifiers` forbids `export {}`.
    "import/unambiguous": "off",
    // Conflicts with `typescript/promise-function-async`, which requires `async` on every function returning a promise.
    "oxc/no-async-await": "off",
    // Optional chaining is ES2020, which every browser the firm uses supports.
    "oxc/no-optional-chaining": "off",
    // The shadcn components forward the props they do not name, and `eslint/prefer-object-spread` asks for spread.
    "oxc/no-rest-spread-properties": "off",
    // With `eslint/no-void`, a synchronous event handler can start async work only as `promise.catch(handler)`.
    "promise/prefer-await-to-then": "off",
    // Base UI's components are styled through className; `shadcn/no-restyle` decides which classes an app may pass.
    "react/forbid-component-props": "off",
    // TypeScript puts JSX in .tsx files; the rule's default allows only .jsx.
    "react/jsx-filename-extension": ["error", { allow: "as-needed", extensions: [".tsx"] }],
    // A JSX depth of 2, with `react/no-multi-comp`, split a sortable table into five files.
    "react/jsx-max-depth": "off",
    // Conflicts with `react/jsx-curly-brace-presence`: text could be written neither bare nor in braces.
    "react/jsx-no-literals": "off",
    // The shadcn components forward the props they do not name.
    "react/jsx-props-no-spreading": "off",
    // One component per file split a sortable table into five files; shadcn keeps a Card's parts together in one.
    "react/no-multi-comp": "off",
    // The automatic JSX runtime needs no React in scope, and `noUnusedLocals` rejects the unused import.
    "react/react-in-jsx-scope": "off",
    "shadcn/no-arbitrary-values": ["error", { message: arbitraryValue }],
    "shadcn/no-inline-styles": ["error", { message: inlineStyle }],
    "shadcn/no-raw-colors": ["error", { message: rawColour }],
    // Components take placement only; `dark:` on a component is an error, since every token switches with the mode.
    "shadcn/no-restyle": [
      "error",
      {
        allow: ["layout"],
        contracts: restyleContracts(),
        deny: ["dark:*"],
        message: restyleFallback,
      },
    ],
    "shadcn/no-unknown-classes": ["error", { message: unknownClass }],
    "shadcn/require-static-classes": "error",
    // React's props and DOM events are mutable library types that no annotation makes deeply readonly.
    "typescript/prefer-readonly-parameter-types": "off",
    // Oxfmt removes the parentheses the rule asks for; `eslint/no-nested-ternary` still forbids nesting.
    "unicorn/no-nested-ternary": "off",
    // With `require-await`, `promise-function-async` and `return-await`, no form of `async () => null` passes.
    "unicorn/no-useless-promise-resolve-reject": "off",
    // React components return null, and refs to DOM elements start as null.
    "unicorn/no-null": "off",
    // Oxfmt prints hexadecimal digits in lower case; the rule wants upper case.
    "unicorn/number-literal-case": "off",
    "vite-plus/prefer-vite-plus-imports": "error",
    // Conflicts with `vitest/prefer-importing-vitest-globals`; Vitest's globals are off by default.
    "vitest/no-importing-vitest-globals": "off",
    // Conflicts with `vitest/valid-title`, which rejects the function title this rule asks for.
    "vitest/prefer-describe-function-title": "off",
    ...appLimits,
  },
  settings: {
    shadcn: {
      // Counts the theme's tokens from the package's stylesheet, beside any the app declares.
      themeImports: ["^@basis/ui/"],
      ui: "@basis/ui",
    },
  },
};

export { appLimits, libraryLimits, lint };
