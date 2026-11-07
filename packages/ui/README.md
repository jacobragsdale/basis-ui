# @basis/ui

The firm's React design system and toolchain: the theme, the components, the Vite+ preset, and the pieces of the app
shell built so far (the formatter, the client's fetch, and the mode and density preferences). [The basis-ui
design](../../docs/design.md) holds the decisions behind them.

## How to build an app on @basis/ui

An app takes its checks, its plugins, its stylesheet and its components from this one package, and declares no styles
of its own. basis-ui's `packages/gallery` is an app built this way.

Prerequisites: an app repo, in git, with `react` and `react-dom` 19.3 as dependencies and `vite-plus` 1.5.0 and
TypeScript 7.0 as dev dependencies. Until roadmap step 1.8 publishes `@basis/ui`, install it from a tarball made with
`vp pm pack` in this package.

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

   `basisPreset()` brings the lint, format and staged-file configuration, with `@shadcn/lint`'s design-system rules,
   and the `vp run` tasks. `basisPlugins()` adds React with the React Compiler, which fails the build on a component
   that breaks the rules of React, and Tailwind. `basisTest()` runs `vp test` in headless Chromium through Playwright.

2. Install the Chromium that the preset's Playwright pins:

   ```sh
   vpx playwright@1.65.0 install chromium
   ```

3. Make `src/styles.css` this one line, and import it from the entry module, `src/main.tsx`, as `import "./styles.css";`:

   ```css
   @import "@basis/ui/styles.css";
   ```

   It brings Tailwind, the theme with its fonts, and the classes the components use, which Tailwind would otherwise
   miss, since it does not scan `node_modules`.

4. Extend the strict tsconfig, adding JSX and Vite's client types, which it does not set yet:

   ```json
   {
     "extends": "@basis/ui/tsconfig.json",
     "compilerOptions": { "jsx": "react-jsx", "types": ["vite-plus/client"] },
     "include": ["src", "vite.config.ts"]
   }
   ```

5. Copy the inline `<script>` in the gallery's `index.html` into the `<head>` of the app's `index.html`. It is the text
   of `headScript`, exported from `@basis/ui`, and applies the stored mode and density before the first paint. The
   gallery's `index.test.ts` fails when its copy differs from `headScript`; copy that test too.

6. Import the components from the package's root:

   ```tsx
   import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@basis/ui";
   ```

To confirm the setup, run `vp check`, `vp test` and `vp build`.

## Using the components

A component's look comes from its props, `variant` and `size`, never from `className`. `className` places a component:
margin, width, and flex or grid placement. The lint rule `shadcn/no-restyle` rejects any other class, and its error
lists the component's variants and sizes. When no variant fits, the variant is added to `@basis/ui` in a basis-ui pull
request, never restyled in the app.

A link that looks like a button is an `<a>` with `buttonVariants` as its class, since `Button`'s `render` prop swaps
its element but keeps the button role:

```tsx
import { buttonVariants } from "@basis/ui";

<a href="/trades" className={buttonVariants({ variant: "outline" })}>
  View trades
</a>;
```

With `render` on any other component, put the rendered element's text inside it, as in
`<Badge render={<a href="/trades">Trades</a>} />`, which is where `jsx-a11y/control-has-associated-label` looks for
it.

`style` may set CSS variables and nothing else, and a class reads the variable: `style={{ "--fill": "40%" }}` with the
class `w-(--fill)`. `@basis/ui`'s types let `style` take a variable.

The components already keep WCAG 2.2's 24 px minimum target in the compact density: every control shorter than `h-8`
carries `min-h-target` and `min-w-target`.

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
