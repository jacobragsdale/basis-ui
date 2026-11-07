# Spike 0.1: Vite+

Vite+ 1.5.0 carries the design: one `vite.config.ts` holds Oxlint at its strictest with `@shadcn/lint`, a preset
spread in from a package adds the lint, format, staged and task blocks, the hooks install on a fresh clone, and the
React Compiler fails a build at `panicThreshold: "all_errors"`. Four things differ from what the design assumed:
`vp check` type-checks with the TypeScript 7.0.2 inside tsgolint, not the installed 7.1 beta; `vp pack` cannot emit
declarations on the 7.1 beta; `no-unknown-classes` does not report palette classes (`no-raw-colors` does); and no
check rejects `dark:` on a plain element. Run on 2026-11-07, on Linux only.

## Versions

| Tool                    | Version                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp` (global and local) | 1.5.0                                                                                                                                         |
| Bundled in Vite+ 1.5.0  | Vite 8.3.5, Rolldown 1.2.16, Vitest 5.1.0, Oxlint 1.91.0, oxlint-tsgolint 7.0.2005, Oxfmt 0.76.0, tsdown 0.23.4                               |
| TypeScript              | 7.1.0-beta (`typescript@beta`); 7.0.2 for one comparison                                                                                      |
| Node, pnpm              | Node 26.13.0; pnpm 12.18.0, which Vite+ downloads through `devEngines`                                                                        |
| React                   | `react` and `react-dom` 19.3.1, `@vitejs/plugin-react` 6.2.1                                                                                  |
| React Compiler          | `babel-plugin-react-compiler` 1.0.0 with `@rolldown/plugin-babel` 0.3.0 and `@babel/core` 7.29.13; `oxc-transform-react` 0.156.0              |
| Lint plugin             | `@shadcn/lint` 0.2.5                                                                                                                          |
| UI libraries            | Tailwind 4.3.4 with `@tailwindcss/vite` 4.3.4, `@base-ui/react` 1.9.0, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0 |
| Data libraries          | TanStack Query 5.106.1, TanStack Form 1.33.5, TanStack Table 9.3.1, Zod 4.6.7, React Hook Form 7.91.0                                         |
| Tests                   | `@vitest/browser-playwright` 5.1.0, `vitest-browser-react` 2.3.0, Playwright 1.64.0 (Chromium 1248, the build cached here)                    |
| Library build           | tsdown 0.23.7, outside Vite+                                                                                                                  |

## Setup

The throwaway apps live outside every repo. The app came from:

```sh
vp create vite:application --directory app --no-interactive --no-agent --no-editor --git --hooks \
  --package-manager pnpm -- --template react-ts
vp add -D typescript@7.1.0-beta
```

Both `tsconfig.app.json` and `tsconfig.node.json` add every flag the design lists to what the template sets:

```json
{
  "strict": true,
  "exactOptionalPropertyTypes": true,
  "noUncheckedIndexedAccess": true,
  "noPropertyAccessFromIndexSignature": true,
  "noImplicitOverride": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "allowUnreachableCode": false,
  "allowUnusedLabels": false,
  "verbatimModuleSyntax": true,
  "isolatedModules": true,
  "erasableSyntaxOnly": true,
  "noUncheckedSideEffectImports": true
}
```

The sample code is what agents write here: a Button and a Card with `cva` and `cn` on Base UI, a custom hook, a
context provider, a TanStack Query hook with a Zod schema, a util with an exhaustive `switch`, an error class, a
TanStack Form, a sortable TanStack Table, unit and component tests, and `vite.config.ts`.

`@basis/ui` is simulated by a separate package, `@basis/ui` 0.0.4, packed with `pnpm pack` and installed from the
tarball (`vp add ../tarballs/basis-ui-0.0.4.tgz`), never through a workspace link. It exports its components as TSX
source (`./button`, and `./card`, a barrel over one file per part), its theme as `./theme.css`, and its preset as
built JavaScript with declarations (`./preset`, built by tsdown 0.23.7). It depends on `@shadcn/lint`; the app does
not. The app's stylesheet is:

```css
@import "tailwindcss";
@import "@basis/ui/theme.css";

@source "../node_modules/@basis/ui/src";
```

and the theme begins `@theme { --color-*: initial; --blur-*: initial; ... }`, followed by its tokens.

## Answers

| #   | Question                                                                                                                              | Answer                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Does `vp check` type-check an app with the strict tsconfig on TypeScript 7.1 beta?                                                    | Yes, with one catch: it checks with the TypeScript 7.0.2 compiled into tsgolint, not with the installed 7.1 beta.                                                |
| 2   | Which Oxlint rules conflict at the strictest settings?                                                                                | 26 changes settle them: 21 rules off, 3 kept with an option, 1 off for `vite.config.ts` only, and the vitest plugin on test files only. All eight plugins exist. |
| 3a  | Do type-aware rules fire on TypeScript 7.1 beta?                                                                                      | Yes, through tsgolint's own TypeScript 7.0.2.                                                                                                                    |
| 3b  | Does tsdown emit declarations on TypeScript 7.1 beta?                                                                                 | No through `vp pack`; yes with tsdown 0.23.7 run directly.                                                                                                       |
| 4   | Does `panicThreshold: "all_errors"` fail `vp build`?                                                                                  | Yes, through both the Babel compiler and the Rust one. `vp dev` keeps serving and shows the error overlay.                                                       |
| 5   | Has Oxlint `no-restricted-imports` and `no-restricted-globals` built in?                                                              | Yes, with custom messages, patterns, and `globalThis.fetch`.                                                                                                     |
| 6a  | Can a preset spread into `vite.config.ts` add tasks, `lint` and `fmt`?                                                                | Yes, from a packed tarball, and `staged` too.                                                                                                                    |
| 6b  | Does `vp create` accept a template from a package?                                                                                    | Yes from a registry: an org package `@scope/create` (tested), a `create-*` package, or a GitHub repo. No from a local path or a tarball outside a monorepo.      |
| 7   | Do the hooks install on a fresh clone and block a bad commit?                                                                         | Yes, on Linux.                                                                                                                                                   |
| 8   | Does `@shadcn/lint` 0.2.5 run under `vp lint`, find the package's components and theme, and stop an app's token hiding the package's? | Yes to all, with `settings.shadcn.themeImports`. Without that setting an app's token still hides the package's.                                                  |
| 9a  | With the palette and blur removed, does `no-unknown-classes` reject `bg-pink-500`, `blur-sm` and `backdrop-blur-md`?                  | No for `bg-pink-500` (`no-raw-colors` rejects it); yes for the two blur classes.                                                                                 |
| 9b  | Can `dark:` be a lint error?                                                                                                          | On a `@basis/ui` component, yes, through `no-restyle`'s `deny`. On a plain element, no, with the built-in rules and `@shadcn/lint`.                              |
| 10  | Do TanStack Form with Zod 4 and TanStack Table v9 build at `all_errors` and behave?                                                   | Yes. React Hook Form's `watch()` fails the build.                                                                                                                |
| 11  | Does `vp test` run browser mode with the Playwright provider?                                                                         | Yes.                                                                                                                                                             |

### 1. Type checking

```sh
vp check
```

```text
x typescript(TS2322): Type 'number | undefined' is not assignable to type 'number'.
x typescript(TS2375): Type '{ label: undefined; }' is not assignable to type 'Opts' with 'exactOptionalPropertyTypes: true'.
x typescript(TS4111): Property 'anything' comes from an index signature, so it must be accessed with ['anything'].
x typescript(TS4114): This member must have an 'override' modifier because it overrides a member in the base class 'Base'.
```

The checker is tsgolint's. Setting `"target": "es2026"`, which 7.1 makes stable, passes `tsc --noEmit` from 7.1 beta
and fails `vp check`:

```text
x typescript(tsconfig-error): Invalid tsconfig
  help: Argument for '--target' option must be: 'es6', ..., 'es2025', 'esnext'.
```

The tsgolint binary carries the string `7.0.2`, and its package, `oxlint-tsgolint` 7.0.2005, is pinned by Vite+.

The scaffolded `vite.config.ts` fails the strict tsconfig on its first line of use. `lazyPlugins` returns
`PluginOption[] | undefined`, which `exactOptionalPropertyTypes` rejects for `plugins`:

```text
Types of property 'plugins' are incompatible.
  Type 'PluginOption[] | undefined' is not assignable to type 'PluginOption[]'.
```

Writing `plugins: lazyPlugins(() => [...]) ?? []` fixes it.

**Fallback.** Run TypeScript 7.1's own `tsc -b` as well, since `vp check` cannot see what 7.1 adds. It passes on the
sample. Keep 7.1-only options such as `es2026` out of the tsconfig until Vite+ ships a tsgolint built on 7.1.

### 2. Oxlint at its strictest

All eight plugins the design names exist in Oxlint 1.91: `typescript`, `react`, `jsx-a11y`, `unicorn`, `import`,
`promise`, `vitest` and `oxc`. The `eslint` plugin is always on. The others are `jest`, `jsdoc`, `nextjs`,
`react-perf`, `node` and `vue`. With the six categories at error and the nursery off, 623 rules run on every file (59
of them type-aware), and 73 more from `vitest` on test files. `options.denyWarnings` makes a warning fail both `vp
lint` and `vp check`.

The sample passes `vp check` with the block below. Each change was found by fixing the code until two rules, or a rule
and Oxfmt, React, TypeScript or Vite, asked for opposite things. The table under the block shows the evidence for
each.

#### The lint block

This is the block step 1.2 puts in the preset. A reason sits on the line above each change, because
`eslint/no-inline-comments` rejects a comment at the end of a line.

```ts
import { fileURLToPath } from "node:url";
import type { OxlintConfig } from "vite-plus/lint";

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
  ignorePatterns: ["dist/**"],
  jsPlugins: [
    // Ships with Vite+: `vite-plus/prefer-vite-plus-imports`.
    { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
    // Resolved from this package, so an app needs no direct dependency on @shadcn/lint.
    { name: "shadcn", specifier: fileURLToPath(import.meta.resolve("@shadcn/lint")) },
  ],
  options: {
    denyWarnings: true,
    reportUnusedDisableDirectives: "error",
    typeAware: true,
    typeCheck: true,
  },
  overrides: [
    {
      // The vitest plugin's rules, such as `vitest/require-hook`, also fire on app code, so only tests get it.
      files: ["**/*.test.ts", "**/*.test.tsx"],
      plugins: [...corePlugins, "vitest"],
    },
    {
      files: ["vite.config.ts"],
      rules: {
        // Vite loads its configuration from the file's default export.
        "import/no-default-export": "off",
      },
    },
  ],
  plugins: corePlugins,
  rules: {
    // Conflicts with `react/function-component-definition`, which wants components as function declarations.
    "eslint/func-style": "off",
    // With `import/consistent-type-specifier-style`, a module's types and values arrive in two imports.
    "eslint/no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
    // With `unicorn/no-typeof-undefined` and `eslint/no-void`, nothing could test for undefined.
    "eslint/no-undefined": "off",
    // Conflicts with `eslint/sort-vars`, which would reorder declarations that depend on each other.
    "eslint/one-var": "off",
    // Conflicts with `typescript/promise-function-async`; `typescript/require-await` is the type-aware version.
    "eslint/require-await": "off",
    // Conflicts with `import/no-default-export`: no module could export anything.
    "import/no-named-export": "off",
    // Allows the stylesheet imports Vite bundles.
    "import/no-unassigned-import": ["error", { allow: ["**/*.css"] }],
    // Conflicts with `import/no-default-export`.
    "import/prefer-default-export": "off",
    // Global declaration files such as vite-env.d.ts stay scripts, and `unicorn/require-module-specifiers` forbids `export {}`.
    "import/unambiguous": "off",
    // Conflicts with `typescript/promise-function-async`, which requires `async` on every function returning a promise.
    "oxc/no-async-await": "off",
    // shadcn's components forward the props they do not name, and `eslint/prefer-object-spread` asks for spread.
    "oxc/no-rest-spread-properties": "off",
    // With `eslint/no-void`, a synchronous event handler can start async work only as `promise.catch(handler)`.
    "promise/prefer-await-to-then": "off",
    // Base UI's components are styled through className; `shadcn/no-restyle` decides which classes an app may pass.
    "react/forbid-component-props": "off",
    // TypeScript puts JSX in .tsx files; the rule's default allows only .jsx.
    "react/jsx-filename-extension": ["error", { allow: "as-needed", extensions: [".tsx"] }],
    // Conflicts with `react/jsx-curly-brace-presence`: text could be written neither bare nor in braces.
    "react/jsx-no-literals": "off",
    // shadcn's components forward the props they do not name.
    "react/jsx-props-no-spreading": "off",
    // The automatic JSX runtime needs no React in scope, and `noUnusedLocals` rejects the unused import.
    "react/react-in-jsx-scope": "off",
    "shadcn/no-arbitrary-values": "error",
    "shadcn/no-inline-styles": "error",
    "shadcn/no-raw-colors": "error",
    // Components take placement only; `dark:` on a component is an error, since every token switches with the mode.
    "shadcn/no-restyle": ["error", { allow: ["layout"], deny: ["dark:*"] }],
    "shadcn/no-unknown-classes": "error",
    "shadcn/require-static-classes": "error",
    // React's props and DOM events are mutable library types that no annotation makes deeply readonly.
    "typescript/prefer-readonly-parameter-types": "off",
    // Oxfmt removes the parentheses the rule asks for; `eslint/no-nested-ternary` still forbids nesting.
    "unicorn/no-nested-ternary": "off",
    // React components return null, and refs to DOM elements start as null.
    "unicorn/no-null": "off",
    // Oxfmt prints hexadecimal digits in lower case; the rule wants upper case.
    "unicorn/number-literal-case": "off",
    // Conflicts with `eslint/no-ternary`: it asks for the ternary that rule forbids.
    "unicorn/prefer-ternary": "off",
    "vite-plus/prefer-vite-plus-imports": "error",
    // Conflicts with `vitest/prefer-importing-vitest-globals`; Vitest's globals are off by default.
    "vitest/no-importing-vitest-globals": "off",
    // Conflicts with `vitest/valid-title`, which rejects the function title this rule asks for.
    "vitest/prefer-describe-function-title": "off",
  },
  settings: {
    shadcn: {
      note: "Design rules: docs/design.md#components",
      // Counts the theme's tokens from the package's stylesheet, beside any the app declares.
      themeImports: ["^@basis/ui/"],
      ui: "@basis/ui",
    },
  },
};
```

Three conflicts are settled by an option rather than by turning a rule off, because the option keeps the rule's
check: `eslint/no-duplicate-imports`, `import/no-unassigned-import` and `react/jsx-filename-extension`. Two are settled
by scope: the vitest plugin runs on test files only, and `import/no-default-export` is off for `vite.config.ts` only.

#### The conflicts and their evidence

| Change                                              | What the two sides asked for                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint/func-style` off                             | `function Card()` fails `func-style` ("Expected a function expression"); `const Card = () =>` fails `react/function-component-definition` ("Function component is not a function declaration").                                                                                                                                                     |
| `eslint/no-duplicate-imports` option                | `import { clsx, type ClassValue }` fails `import/consistent-type-specifier-style`; splitting it fails `no-duplicate-imports` ("'clsx' import is duplicated"). `import/no-duplicates` still catches real duplicates.                                                                                                                                 |
| `eslint/no-undefined` off                           | `x === undefined` fails `no-undefined`, `typeof x === "undefined"` fails `unicorn/no-typeof-undefined`, and `x === void 0` fails `eslint/no-void`.                                                                                                                                                                                                  |
| `eslint/one-var` off                                | It joins `const width = 2, area = width * width;` into one statement, and `eslint/sort-vars` then asks for `area` before `width`, which reads `width` before it exists.                                                                                                                                                                             |
| `eslint/require-await` off                          | `async () => load()` fails it; `() => load()` fails `typescript/promise-function-async`; `async () => await load()` fails `typescript/return-await`.                                                                                                                                                                                                |
| `import/no-named-export` off                        | With `import/no-default-export`, a module could export nothing.                                                                                                                                                                                                                                                                                     |
| `import/no-unassigned-import` option                | Vite bundles a stylesheet through `import "./index.css"`.                                                                                                                                                                                                                                                                                           |
| `import/prefer-default-export` off                  | A file with one export must default-export it, which `import/no-default-export` forbids.                                                                                                                                                                                                                                                            |
| `import/no-default-export` off for `vite.config.ts` | Vite reads the default export.                                                                                                                                                                                                                                                                                                                      |
| `import/unambiguous` off                            | `vite-env.d.ts`, which augments `ImportMetaEnv`, must stay a script; `export {}` fails `unicorn/require-module-specifiers` ("Empty export specifier is not allowed").                                                                                                                                                                               |
| `oxc/no-async-await` off                            | `typescript/promise-function-async` requires `async` on every function returning a promise, such as a `queryFn`.                                                                                                                                                                                                                                    |
| `oxc/no-rest-spread-properties` off                 | Base UI's `render` prop and shadcn's components forward `...props`; `eslint/prefer-object-spread` rejects `Object.assign({}, base)`.                                                                                                                                                                                                                |
| `promise/prefer-await-to-then` off                  | In a synchronous event handler, `void save()` fails `eslint/no-void`, `save().catch(report)` fails this rule, `async () => { await save(); }` fails `typescript/no-misused-promises` and `typescript/strict-void-return`, and `save()` fails `typescript/no-floating-promises`. Keeping `no-void` makes every started promise handle its rejection. |
| `react/forbid-component-props` off                  | It forbids `className` on every component, including Base UI's primitives inside `@basis/ui`, and the layout classes `no-restyle` allows.                                                                                                                                                                                                           |
| `react/jsx-filename-extension` option               | Its default allows JSX only in `.jsx` files.                                                                                                                                                                                                                                                                                                        |
| `react/jsx-no-literals` off                         | `<p>three</p>` fails it; `<p>{"one"}</p>` fails `react/jsx-curly-brace-presence` ("Curly braces are unnecessary here").                                                                                                                                                                                                                             |
| `react/jsx-props-no-spreading` off                  | The same forwarding of `{...props}`.                                                                                                                                                                                                                                                                                                                |
| `react/react-in-jsx-scope` off                      | The template's `"jsx": "react-jsx"` needs no React in scope, and an unused `React` import fails `noUnusedLocals`.                                                                                                                                                                                                                                   |
| `typescript/prefer-readonly-parameter-types` off    | `Readonly<ComponentProps<"div">>` and `Readonly<ChangeEvent<HTMLInputElement>>` still fail it: React's props and DOM events are not deeply readonly.                                                                                                                                                                                                |
| `unicorn/no-nested-ternary` off                     | Oxfmt prints `a ? "x" : (b ? "y" : "z")` without the parentheses the rule asks for.                                                                                                                                                                                                                                                                 |
| `unicorn/no-null` off                               | A component that renders nothing returns `null`, and `useRef<HTMLElement>(null)` is how a DOM ref starts.                                                                                                                                                                                                                                           |
| `unicorn/number-literal-case` off                   | Oxfmt prints `0xFF` as `0xff`; the rule asks for `0xFF`.                                                                                                                                                                                                                                                                                            |
| `unicorn/prefer-ternary` off                        | It asks for a ternary in `if (flag) { return "a"; } else { return "b"; }`, which `eslint/no-ternary` forbids.                                                                                                                                                                                                                                       |
| `vitest/no-importing-vitest-globals` off            | Importing `describe` fails it; using it as a global fails `vitest/prefer-importing-vitest-globals` and the type check.                                                                                                                                                                                                                              |
| `vitest/prefer-describe-function-title` off         | `describe("formatBps")` fails it; `describe(formatBps)` fails `vitest/valid-title` ("Title must be a string").                                                                                                                                                                                                                                      |
| vitest plugin on test files only                    | `vitest/require-hook` reported `createRoot(...).render(...)` in `main.tsx`.                                                                                                                                                                                                                                                                         |

No other rule fought Oxfmt here. Of the rules eslint-config-prettier turns off, only five exist in Oxlint: the two
above, `curly` (its default, `all`, agrees with Oxfmt), `unicorn/empty-brace-spaces` (Oxfmt prints `{}` too), and
`no-unexpected-multiline`, which eslint-config-prettier says conflicts only in rare code and which never fired here.

One more conflict is left to `@basis/ui` itself, since apps never meet it. To let `style` set a CSS variable,
`@basis/ui` must widen React's `CSSProperties`: without that, `style={{ "--fill": "40%" }}` fails TypeScript with
TS2353. Declaration merging needs an interface with an index signature, which
`typescript/consistent-indexed-object-style` rejects ("A record is preferred over an index signature"). That one line
takes an
`// oxlint-disable-next-line typescript/consistent-indexed-object-style -- reason` comment;
`eslint/capitalized-comments` accepts the directive.

#### Strict rules kept that hurt

These stay on, as the design asks, but each makes ordinary code longer. Step 1.2 or the maintainer may want to
revisit them.

- `react/jsx-max-depth` (maximum 2), with `react/no-multi-comp` and `import/max-dependencies` (maximum 10). Together
  they force a file for every three levels of JSX. A sortable TanStack Table took five files (the table, a header row,
  a header cell, a body row, and the feature definitions). shadcn's Card, whose parts share one file, became one file
  per part behind a barrel, and a page that imported the parts separately went past ten imports.
- `eslint/no-magic-numbers` with no ignored values, so `0` and `1` need names, as do test inputs and Zod limits such as
  `.min(1)`.
- `eslint/no-ternary`: conditional rendering is written with `&&` or an early return.
- `oxc/no-optional-chaining`: `data?.map(...)` becomes `data !== undefined && data.map(...)`. It bans an ES2020
  feature the build target already supports, as its two sibling `oxc` rules above did.
- `vitest/require-test-timeout` and `vitest/prefer-expect-assertions`: each test file calls
  `vi.setConfig({ testTimeout: 1000 })` with a literal (a named constant fails "Timeout must be a number"), and each
  test starts with `expect.hasAssertions()`.
- `eslint/sort-imports` sorts by the first imported name, case-sensitively, across blank lines, so imports cannot be
  grouped by origin.
- `react/only-export-components`: `buttonVariants` and a context's hook each move to a file of their own.
- `eslint/no-use-before-define`: a TanStack Router file route reads its params through `getRouteApi`, since the
  component and `Route` refer to each other.
- `eslint/no-redeclare` rejects Zod's `const Trade` with `type Trade`; name the schema `tradeSchema`.

Two messages mislead an agent. `typescript/no-floating-promises` says to "add void operator", which `eslint/no-void`
rejects; the fix is `.catch(handler)`. `jsx-a11y/control-has-associated-label` reports a `<th>`, `<td>` or `<button>`
holding `<table.FlexRender />`, the form TanStack's docs use; `<FlexRender />` imported from `@tanstack/react-table`
passes.

### 3. TypeScript 7.1 beta

Type-aware rules fire:

```sh
vp lint src/lib/floating.ts
```

```text
src/lib/floating.ts:6:3: error typescript(no-floating-promises): Promises must be awaited, add void operator to ignore.
```

Declarations through `vp pack` fail, because the tsdown bundled in Vite+ (0.23.4) recognizes only TypeScript 7.0:

```sh
vp pack
```

```text
error: TypeScript Go is not installed. Please install the `typescript@7.0` or `@typescript/native-preview` package to use the `tsgo` generator.
```

The same library with `typescript@7.0.2` emits `dist/index.d.mts` ("Emit types with typescript@7.0.2"). tsdown 0.23.7,
run directly, uses the 7.1 beta's declaration API and emits correct declarations:

```sh
vp exec tsdown
```

```text
ℹ Emit types with TypeScript Go
ℹ dist/index.d.mts  0.30 kB │ gzip: 0.21 kB
✔ Build complete in 174ms
```

Its debug log names `typescript@7.1.0-beta/node_modules/typescript/lib/version.cjs` as the compiler. `vp pack` with
`dts: { generator: "oxc" }` and `isolatedDeclarations: true` also works on the beta, but `isolatedDeclarations` would
make every exported `cva(...)` result carry a written type.

**Fallback.** Build `@basis/ui`'s JavaScript parts with tsdown 0.23.7 as a devDependency, in a `vp run pack` task,
until Vite+ bundles a tsdown that knows 7.1. The other fallbacks are `vp pack` with TypeScript 7.0.2, or the `oxc`
generator.

### 4. The React Compiler

`panicThreshold` exists in both compilers. `babel-plugin-react-compiler` 1.0.0 accepts `none`, `critical_errors` and
`all_errors`, and so does `oxc-transform-react` 0.156.0, a Rust port that `@vitejs/plugin-react` 6.2.1 calls
experimental. They are wired into Vite 8 in two ways:

```ts
// The Rust compiler, through @vitejs/plugin-react and oxc-transform-react.
plugins: lazyPlugins(() => [react({ compiler: { panicThreshold: "all_errors" } }), tailwindcss()]) ?? [],

// React Compiler 1.0, through Babel in Rolldown.
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
plugins:
  lazyPlugins(() => [
    react(),
    babel({ presets: [reactCompilerPreset({ panicThreshold: "all_errors" })] }),
    tailwindcss(),
  ]) ?? [],
```

A component that assigns to its props fails `vp build` either way:

```text
[plugin @rolldown/plugin-babel] src/components/broken.tsx
RolldownError: [BabelError] Found 1 error:
Error: This value cannot be modified
>  8 |   label.text = "changed";
```

```text
[plugin vite:react-compiler] src/components/broken.tsx
  x react-compiler(Immutability): This value cannot be modified
  note: React Compiler skipped optimizing this component or hook
```

A hook called inside an `if` fails the same way ("Hooks must always be called in a consistent order"), and with the
default threshold the same component builds and is silently left unoptimized (both checked with Babel). The compiler
fails only what it can prove: `items.push("extra")` on a prop array built. The final sample builds in 192 ms with the
Rust compiler and 583 ms with Babel.

In `vp dev` the server keeps running. The broken module answers HTTP 500, the terminal logs "Internal server error:
This value cannot be modified", and the page shows Vite's error overlay with the compiler's message (checked in
headless Chromium for both compilers).

The Babel compiler needs Babel 7. With `@babel/core` 8.1.0, which `vp add @babel/core` installs, React Compiler 1.0
fails on every destructured default, such as shadcn's `variant = "default"`:

```text
Todo: (BuildHIR::lowerAssignment) Expected object property value to be an LVal, got: AssignmentPattern
```

### 5. Restricted imports and globals

Both rules are built in and take a message. `no-restricted-globals`, with `checkGlobalObject`, also catches
`globalThis.fetch`. `no-restricted-imports` takes paths and `group` or `regex` patterns. This is the shape step 1.3
uses, with an override for the client layer:

```ts
"eslint/no-restricted-globals": [
  "error",
  {
    checkGlobalObject: true,
    globals: [
      {
        message: "ERROR feature code calls the backend only through the generated client. Import the operation's hook from @/api/client instead.",
        name: "fetch",
      },
    ],
  },
],
"eslint/no-restricted-imports": [
  "error",
  {
    paths: [{ message: "ERROR feature code calls the backend only through the generated client. Use @/api/client instead.", name: "axios" }],
    patterns: [{ group: ["**/api/generated/**"], message: "ERROR import the generated client through @/api/client, not its generated files." }],
  },
],
// In overrides, for files: ["src/api/**"]: both rules "off".
```

```text
src/features/restricted.ts:5:26: error eslint(no-restricted-globals): Unexpected use of 'fetch'. ERROR feature code calls the backend only through the generated client. Import the operation's hook from @/api/client instead. help: Use a local variable or function parameter instead of the restricted global.
src/features/restricted.ts:6:38: error eslint(no-restricted-globals): Unexpected use of 'fetch'. ERROR feature code ...
src/features/restricted.ts:1:1: error eslint(no-restricted-imports): 'axios' import is restricted from being used. help: ERROR feature code calls the backend only through the generated client. Use @/api/client instead.
src/features/restricted.ts:2:1: error eslint(no-restricted-imports): '@/api/generated/positions' import is restricted from being used by a pattern. help: ERROR import the generated client through @/api/client, not its generated files.
```

The `fetch` in `src/api/positions.ts` was not reported. Two details of the output: `no-restricted-imports` prints the
custom message as its `help`, and `no-restricted-globals` appends a built-in help line that suggests a local variable.

### 6. The preset and `vp create`

The app's whole configuration is a spread and its plugins:

```ts
import { defineConfig, lazyPlugins } from "vite-plus";
import { basisPreset } from "@basis/ui/preset";
import { playwright } from "vite-plus/test/browser-playwright";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  ...basisPreset(),
  plugins:
    lazyPlugins(() => [react({ compiler: { panicThreshold: "all_errors" } }), tailwindcss()]) ?? [],
  resolve: { tsconfigPaths: true },
  test: {
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
      provider: playwright(),
    },
  },
});
```

`basisPreset()`, typed `(): ViteUserConfig` from `vite-plus`, returns `fmt`, `lint`, `run.tasks` and `staged`. With
the preset installed from its tarball:

```sh
vp run hello
```

```text
$ node -e "console.log('task from the @basis/ui preset')" ⊘ cache disabled
task from the @basis/ui preset
```

`vp lint --print-config` showed the preset's plugins and both JS plugins, and `@shadcn/lint`'s rules fired (section 8)
with the plugin resolved from the preset's own dependency, after `@shadcn/lint` was removed from the app. A preset
`fmt: { semi: false }` made `vp fmt --check` report 32 files. The commit hook in section 7 ran the preset's `staged`
block, since the app has none of its own.

`vp create` takes builtins (`vite:*`), GitHub repos (`github:user/repo`, fetched with degit), and npm packages: a
`create-*` package, or an org's `@scope/create` whose `package.json` has a `createConfig.templates` manifest. It reads
a scope's registry from `.npmrc`. A static registry served on `127.0.0.1` with `@basis:registry=` in `.npmrc` stood in
for the internal feed:

```sh
vp create @basis --no-interactive
vp create @basis:app --directory my-ui --no-interactive --no-agent --no-editor --no-git --no-hooks
```

```text
  app   A basis-ui app  ./templates/app
◇ Scaffolded my-ui
✓ Dependencies installed in 496ms
```

A local path or a tarball fails outside a monorepo:

```text
■ Template "../tarballs/basis-create-0.0.1.tgz" not found on npm. Run vp create --list to see available templates.
```

Inside a monorepo, `create.templates` in `vite.config.ts` lists local templates. `vp create` also rewrites a
template's `vite.config.ts`: it inserted `fmt: {}` and a one-line `lint: {...}` above `...basisPreset()`. The spread
comes later, so the preset's values win, but the generated file carries a dead block.

**Fallback.** None needed for the preset. For the template, `vp create @basis:app` works once `@basis/create` is
published to a registry the desktop can reach.

### 7. Hooks on a fresh clone

The scaffold writes `.vite-hooks/pre-commit`, `"prepare": "vp config"`, and a `staged` block. The dispatcher in
`.vite-hooks/_` is ignored by git. The hook here was `vp staged` then `vp check`:

```sh
git clone origin.git app-clone && cd app-clone
git config core.hooksPath          # empty
vp install
git config core.hooksPath          # .vite-hooks/_
vp hooks status
```

```text
Preference:     enabled
core.hooksPath: .vite-hooks/_ (Vite+ dispatcher)
Dispatcher:     installed (.vite-hooks/_)
Project hooks:  pre-commit
```

A commit with a floating promise was blocked, and no commit was made:

```text
✖ vp check --fix
✖ Failed to run tasks for staged files!
✔ Done reverting to original state!
x typescript(no-floating-promises): Promises must be awaited, add void operator to ignore.
VITE+ - pre-commit script failed (code 1)
```

A commit of a badly formatted file went through with the file formatted, and a clean commit ran both steps:

```text
✔ vp check --fix
pass: All 37 files are correctly formatted (186ms, 16 threads)
pass: Found no warnings, lint errors, or type errors in 29 files (631ms, 16 threads)
[main 5b33257] clean commit
```

`vp check` in the hook reads the working tree, not only what is staged. `vp staged` runs `vp check --fix` with
lint-staged, which needs Git 2.32 or later.

### 8. `@shadcn/lint` under `vp lint`

It runs through `lint.jsPlugins`, finds the components from the tarball (through the package's exports, and through
the Card barrel to its part files), reads Button's variants from its `cva`, and reads the tokens from
`@basis/ui/theme.css`. With `no-restyle` at `allow: ["layout"]`, `className="mt-4 w-full"` on a Card passed. Every
rule fired:

```text
error shadcn(no-restyle): "p-8" is not allowed on <Card>: <Card> owns its spacing. For space around it, use margin here or gap on the parent. Design rules: docs/design.md#components
error shadcn(no-restyle): "rounded-full" is not allowed on <Button>: <Button> owns its shape. Use a variant: default, destructive, ghost, outline. ...
error shadcn(no-raw-colors): "bg-pink-500" uses the raw Tailwind palette and no declared theme color is close to it. Use one of: accent, background, border, card, destructive, foreground, input, primary, ring, ...
error shadcn(no-arbitrary-values): "p-[13px]" hardcodes an off-token value. Use "p-3.25" instead (same value, on the scale). ...
error shadcn(no-arbitrary-values): "text-[#123456]" hardcodes a color and no declared theme color is close to it. ...
error shadcn(no-inline-styles): Inline style sets color. Style through classes; use CSS custom properties for dynamic values. ...
error shadcn(no-unknown-classes): "rounded-huge" is not a class this project's Tailwind knows, so no CSS is generated for it. ...
error shadcn(require-static-classes): Dynamically built className on <Button> cannot be checked. Use static class strings. ...
```

In `style={{ color: "#ff0000", "--fill": "40%" }}` only `color` was reported, so a CSS variable is allowed. A lint of
one file took 0.6 seconds.

An app token no longer hides the package's, if the preset sets `themeImports`. With `--color-brand` declared in the
app's `src/index.css`:

| `settings.shadcn`                                    | `bg-primary bg-brand text-muted-foreground`                      |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `{ ui: "@basis/ui", themeImports: ["^@basis/ui/"] }` | passes                                                           |
| `{ ui: "@basis/ui" }`                                | `"bg-primary" is not a declared theme color. Use one of: brand.` |

The lint accepts the app's own token too, so it does not enforce the design's "apps declare no tokens".

### 9. The palette, blur, and `dark:`

With `--color-*: initial` and `--blur-*: initial`, and `no-raw-colors` turned off to isolate `no-unknown-classes`:

```text
error shadcn(no-unknown-classes): "blur-sm" is not a class this project's Tailwind knows, so no CSS is generated for it. ...
error shadcn(no-unknown-classes): "backdrop-blur-md" is not a class this project's Tailwind knows, so no CSS is generated for it. ...
```

`bg-pink-500` passed `no-unknown-classes`, though Tailwind generated no CSS for it; `no-raw-colors` rejects it, as in
section 8. Without `--blur-*: initial` both blur classes passed. The theme removes only the blur scale: `blur-none`,
`backdrop-blur-none`, `backdrop-brightness-50`, `backdrop-grayscale` and `drop-shadow-md` still pass, and
`blur-[2px]` fails `no-arbitrary-values`.

`dark:bg-card` on a plain element passed every rule. I found no directive in Tailwind 4.3 that removes a built-in
variant, and `no-unknown-classes`' `deny` only removes exemptions. On a component, `no-restyle`'s `deny` works:

```text
error shadcn(no-restyle): "dark:mt-2" is not allowed on <Button>: its contract denies dark:*.
```

Oxlint has no `no-restricted-syntax`. A local rule of 25 lines through `vite-plus/lint/plugins` rejected `dark:` in
any string and template literal:

```text
src/probes/dark.tsx:4:23: ERROR `dark:` variants are not allowed: every theme token already switches with the mode. Use the token's class without `dark:`. [Error/basis(no-dark-variant)]
```

**Fallback.** Keep `no-raw-colors` as the palette's check. For `dark:` on plain elements, either a local JS rule in
the preset, which the design's "no JS plugins but `@shadcn/lint`" forbids, or a text search for `dark:` in `vp run
check-full`. shadcn's own sources use `dark:` in their `cva` classes, such as Button's `dark:bg-input/30`, so step 1.4
removes those when it ports them.

### 10. TanStack Form, TanStack Table, and React Hook Form

The form uses TanStack Form's `createFormHook`, with `validators: { onChange: orderSchema }` on a Zod 4 schema. The
table uses `useTable` with `rowSortingFeature`, `createSortedRowModel()` and a header button wired to
`getToggleSortingHandler()`. Both build at `all_errors` with the Babel compiler and with the Rust one, and pass `vp
check` under the lint block. The browser tests type into the field and click the headers:

```text
 ✓ |chromium| src/features/order-form.test.tsx > order form > shows the schema's message while typing 80ms
 ✓ |chromium| src/features/positions-table.test.tsx > positions table > sorts by a column when its header is clicked 206ms
```

The first click on a number column sorts it descending, TanStack's default. A field's label must not wrap its error
text, or the field's accessible name changes and `getByRole("textbox", { name: "Symbol" })` stops finding it.

React Hook Form fails the build with both compilers:

```text
Compilation Skipped: Use of incompatible library
> 10 |   const symbol = watch("symbol");
     |                  ^^^^^ React Hook Form's `useForm()` API returns a `watch()` function which cannot be memoized safely.
```

### 11. Browser mode

```ts
test: {
  browser: { enabled: true, headless: true, instances: [{ browser: "chromium" }], provider: playwright() },
},
```

with `playwright` from `vite-plus/test/browser-playwright` and Playwright 1.64.0 matched to the cached Chromium. A test
of the runner itself passed:

```ts
expect(server.provider).toBe("playwright");
expect(server.browser).toBe("chromium");
expect(navigator.userAgent).toContain("HeadlessChrome");
```

```text
 ✓ |chromium| src/lib/browser.test.ts > the browser > is Chromium driven by Playwright 1ms
      Tests  1 passed (1)
```

The sample's seven tests run in 1.2 seconds. `vitest-browser-react` 2.3.0 renders components, and
`vite-plus/test/browser` supplies `page`.

## What step 1.2 must do

1. Put the lint block above in the preset as it stands, with `@shadcn/lint` 0.2.5 as an exact dependency of
   `@basis/ui`, resolved through `import.meta.resolve` so apps do not install it.
2. Ship the preset as built JavaScript with declarations, typed `(): ViteUserConfig`. Node will not run a `.ts` file
   from `node_modules`.
3. Return `fmt: {}`, `lint`, `staged: { "*": "vp check --fix" }` and the `run.tasks` slots from the preset. An app
   spreads it first and adds `plugins`, `resolve` and `test`. Write `lazyPlugins(...) ?? []`, which the strict tsconfig
   needs.
4. Pick the React Compiler route and pin it. React Compiler 1.0 goes through `@rolldown/plugin-babel` 0.3.0 and
   `reactCompilerPreset({ panicThreshold: "all_errors" })`, and needs `@babel/core` 7 pinned, since Babel 8 breaks it.
   The Rust compiler, `react({ compiler: { panicThreshold: "all_errors" } })` with `oxc-transform-react` 0.156, built
   the sample three times faster and is marked experimental. Both caught the same faults here.
5. Add `tsc -b`, from the installed TypeScript, to `check-full` or the commit hook, since `vp check` checks with
   TypeScript 7.0.2.
6. Build `@basis/ui` with tsdown 0.23.7 directly, or pin TypeScript 7.0.2 for `vp pack`, until Vite+ bundles a tsdown
   that knows 7.1.
7. Ship the `CSSProperties` augmentation for CSS variables in a module every app imports, with its one disable
   directive.
8. Set `settings.shadcn.themeImports: ["^@basis/ui/"]` and have the theme remove `--color-*` and `--blur-*`. Add an
   `@source` for the package's components to the app's stylesheet, or Tailwind will not see their classes.
9. Write the commit hook as `vp staged` then `vp check` (and `vp test` if the design keeps it there). The scaffold
   writes only `vp staged`.
10. Pin Playwright to the version whose Chromium is installed (1.64.0 for Chromium 1248 here), or have `vp run doctor`
    install the browser.
11. Decide on the two choices the spike cannot make: whether Vite+'s own `vite-plus/oxlint-plugin`, a JS plugin its
    template enables, stays beside `@shadcn/lint`, and whether `react/jsx-max-depth` at 2 stays on.

## Left for the maintainer (work)

On a Citrix desktop, on Windows and in WSL:

1. Install `vp` without admin rights, and send `vp --version`.
2. In a clone of a repo with this preset, run `vp install` against the internal npm feed, and send its output and
   `git config core.hooksPath`.
3. Make a commit with a floating promise in it, and send the hook's output (Vite+ issue #2252 reports hooks that do not
   install on Windows).
4. Run `vp check`, `vp test` and `vp build`, and send their timings.
5. Publish `@basis/create` to the internal feed, run `vp create @basis:app`, and send the output.
