# @basis/ui

The firm's React design system and toolchain: the theme, the components, the Vite+ preset, and the pieces of the app
shell built so far (the formatter, the client's fetch, and the mode and density preferences). [The basis-ui
design](../../docs/design.md) holds the decisions behind them.

## How to build an app on @basis/ui

An app takes its checks, its plugins, its stylesheet and its components from this one package, and declares no styles
of its own. `packages/gallery` in this repo is an app built this way.

Prerequisites: an app with `@basis/ui`, `react` and `react-dom` 19.3 as dependencies, and `vite-plus` 1.5.0 and
TypeScript 7.0 as dev dependencies.

To set the app up:

1. Make `vite.config.ts` the preset, its plugins and its tests:

   ```ts
   import { basisPlugins, basisPreset, basisTest } from "@basis/ui/preset";
   import { defineConfig } from "vite-plus";

   export default defineConfig({
     ...basisPreset(),
     plugins: basisPlugins(),
     test: await basisTest(),
   });
   ```

   `basisPreset()` brings the lint, format and staged-file configuration and the `vp run` tasks. `basisPlugins()` adds
   React with the React Compiler, which fails the build on a component that breaks the rules of React, and Tailwind.
   `basisTest()` runs `vp test` in headless Chromium through Playwright.

2. Make the app's whole stylesheet one line, and import it once from the entry module:

   ```css
   @import "@basis/ui/styles.css";
   ```

   It brings Tailwind, the theme with its fonts, and the classes the components use, which Tailwind would otherwise
   miss, since it does not scan `node_modules`.

3. Extend the strict tsconfig, adding JSX and Vite's client types, which it does not set yet:

   ```json
   {
     "extends": "@basis/ui/tsconfig.json",
     "compilerOptions": { "jsx": "react-jsx", "types": ["vite-plus/client"] },
     "include": ["src", "vite.config.ts"]
   }
   ```

4. Put the text of `headScript`, exported from `@basis/ui`, in an inline `<script>` in `index.html`'s `<head>`, so the
   stored mode and density apply before the first paint. The gallery's `index.test.ts` holds its copy to the package's.

5. Import the components from the package's root:

   ```tsx
   import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@basis/ui";
   ```

To confirm the setup, run `vp check` and `vp build`. `vp check` must be run inside a git repository.

## Using the components

A component's look comes from its props, `variant` and `size`, never from `className`. `className` places a component:
margin, width, and flex or grid placement. `shadcn/no-restyle` rejects anything else, and its error lists the
component's variants and sizes. When no variant fits, the variant is added here, not restyled in the app.

- A link that looks like a button is an `<a>` with `buttonVariants` as its class. `Button`'s `render` prop swaps its
  element but keeps the button role.
- With `render`, put the rendered element's text inside it, as in `<Badge render={<a href="/trades">Trades</a>} />`,
  where `jsx-a11y/control-has-associated-label` looks for it.
- `style` may set CSS variables and nothing else, read by a class: `style={{ "--fill": "40%" }}` with `w-(--fill)`.
  `@basis/ui`'s types let `style` take a variable.
- Controls shorter than `h-8` keep a 24 px target in the compact density through `min-h-target` and `min-w-target`.

## Adding a component

1. Port it from shadcn's Base UI source, keeping shadcn's names, props and parts, into
   `src/components/NAME.tsx`, or `NAME.ts` when it renders through `useRender` and holds no JSX. Replace every
   `dark:` class with a token and every arbitrary value with the theme's scales and opacity modifiers.
2. Put its `cva` classes in `src/components/NAME-variants.ts`, named after the component, such as `buttonVariants`
   for `Button`: a component file exports only components, and `@shadcn/lint` finds a component's variants by that
   name.
3. Export the component and its variants from `src/index.ts`.
4. Run `vp run @basis/ui#build`. The React Compiler fails the build on a component that breaks the rules of React, and
   the gallery uses the build, not the source.
5. Show every variant and size on its family's gallery page in `packages/gallery/src/pages`, and test it in the page's
   test file: its role and accessible name, its variants, and, for a control, its 24 px target in the compact density.
