# @basis/ui

The firm's React design system and toolchain: the theme, the components and their icons, the Vite+ preset, and the
pieces of the app shell built so far (the formatter, the client's fetch, and the mode and density preferences). [The
basis-ui design](../../docs/design.md) holds the decisions behind them.

## How to build an app on @basis/ui

An app takes its checks, its plugins, its stylesheet, its components and its icons from this one package, and declares
no styles of its own. basis-ui's `packages/gallery` is an app built this way.

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
   that breaks the rules of React, Tailwind, and the head script: an inline `<script>` that `vp dev` and `vp build`
   write at the end of `index.html`'s `<head>`, which applies the stored mode and density before the first paint. Its
   text is `headScript`, exported from `@basis/ui`; the app keeps no copy of it. `basisTest()` runs `vp test` in
   headless Chromium through Playwright.

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

4. Make `tsconfig.json` extend the strict tsconfig, which also sets JSX and Vite's client types:

   ```json
   {
     "extends": "@basis/ui/tsconfig.json",
     "include": ["src", "vite.config.ts"]
   }
   ```

5. Import the components and icons from the package's root:

   ```tsx
   import { Badge, Button, ButtonLink, Card, CardContent, ChevronDownIcon } from "@basis/ui";
   ```

To confirm the setup, run `vp check`, `vp test` and `vp build`. The built `dist/index.html` holds the head script, in
a `<script>` before `</head>`.

## Using the components

A component's look comes from its props, `variant` and `size`, never from `className`. `className` places a component:
margin, width, and flex or grid placement. The lint rule `shadcn/no-restyle` rejects any other class, and its error
lists the component's variants and sizes. When no variant fits, the variant is added to `@basis/ui` in a basis-ui pull
request, never restyled in the app. `@basis/ui` exports no `*Variants` helpers, so no plain element can take a
component's classes either.

A link that looks like a button is a `ButtonLink`, which takes Button's `variant` and `size` and stays a link, since
`Button`'s `render` prop swaps its element but keeps the button role. With `render`, `ButtonLink` becomes the router's
link component, such as TanStack Router's `Link`, which renders an `<a>` of its own:

```tsx
import { ButtonLink } from "@basis/ui";

<ButtonLink href="/trades" variant="outline">
  View trades
</ButtonLink>;

<ButtonLink render={<Link to="/trades" />} variant="outline">
  View trades
</ButtonLink>;
```

With `render` on any other component, put the rendered element's text inside it, as in
`<Badge render={<a href="/trades">Trades</a>} />`, which is where `jsx-a11y/control-has-associated-label` looks for
it.

`style` may set CSS variables and nothing else, and a class reads the variable: `style={{ "--fill": "40%" }}` with the
class `w-(--fill)`. `@basis/ui`'s types let `style` take a variable.

The components already keep WCAG 2.2's 24 px minimum target in the compact density: every control shorter than `h-8`
carries `min-h-target` and `min-w-target`.

## Using the icons

`@basis/ui` exports a set of lucide's icons under lucide-react's names with the `Icon` suffix: each icon's current
name, such as `TriangleExclamationPointIcon`, and its older aliases, such as `TriangleAlertIcon` and
`AlertTriangleIcon`. The gallery's Icons page shows every one, and `src/index.ts` lists them. An app installs no icon
package.

- **Size.** A component sizes the icons inside it, as Button and Badge do. Beside text in a Button or Badge, an icon
  takes `data-icon="inline-start"` or `data-icon="inline-end"`, which adjusts the padding on that side. Outside a
  component that sizes it, an icon is 24 px square. `className` may resize or place it, as with `size-4` or `shrink-0`.
- **Colour.** An icon draws in the current text colour. `shadcn/no-restyle` rejects colour, opacity and motion classes
  on an icon, so a coloured icon sits in an element that sets the colour, such as `<span className="text-success">`.
- **Props.** An icon takes an `<svg>` element's props except `children`, `color`, `fill`, `stroke`, `strokeWidth`,
  `strokeLinecap`, `strokeLinejoin`, `viewBox` and `xmlns`. It has none of lucide-react's `size`, `color`,
  `strokeWidth` or `absoluteStrokeWidth`.
- **Names.** An icon is hidden from assistive technology unless an `aria-*` prop or `role` is set. An icon that carries
  meaning on its own, with no text beside it, takes an `aria-label`; inside an icon-only Button, the Button takes it.

An icon `@basis/ui` lacks is added to it, as [Adding an icon](#adding-an-icon) describes.

## Adding a component

1. Port it from shadcn's Base UI source, keeping shadcn's names, props and parts, into
   `src/components/NAME.tsx`, or `NAME.ts` when it renders through `useRender` and holds no JSX. Replace every
   `dark:` class with a token and every arbitrary value with the theme's scales and opacity modifiers. Merge classes
   with `cn` from the `cn` package, as shadcn does; take `cva` from `#vendor/cva/cva.ts`, and each icon from its file
   in `src/vendor/lucide`, such as `#vendor/lucide/chevron-down.tsx`.
2. Put its `cva` classes in `src/components/NAME-variants.ts`, each named after the component or part it styles, such
   as `buttonVariants` for `Button` or `selectTriggerVariants` for `SelectTrigger`: `@shadcn/lint` finds a component's
   variants by that name, and a component file exports only components (`react/only-export-components`). A part with
   no `variant` or `size` needs no `cva`. Other `@basis/ui` components may import the variants; the package never
   exports them, which `tests/exports.test.ts` checks.
3. If the component takes another component's `variant` and `size`, as `ButtonLink` takes Button's, import that
   component's variants under this one's name, so that `shadcn/no-restyle`'s errors list them:

   ```ts
   import { buttonVariants as buttonLinkVariants } from "./button-variants.ts";
   ```

4. Style the icons and other `@basis/ui` components it renders through its own elements' classes, such as
   `[&_svg]:text-muted-foreground` on a Select's trigger. `shadcn/no-restyle` checks `@basis/ui`'s own code as it
   checks an app's, so a colour, opacity or motion class on an icon, or a padding class on a Button, fails inside the
   package too; a sizing class such as `size-4` may stay.
5. Export it by name from its family's block of `src/index.ts`, such as
   `export { Select, SelectContent, SelectItem } from "./components/select.tsx";` in the forms and inputs block. Each
   family's agent edits only its family's block, so families built at once do not collide. The file uses no
   `export *`: `oxc/no-barrel-file` fails a file whose `export *` lines load more than 100 modules, and one Base UI
   component can load more than that.
6. Run `vp run @basis/ui#build`, then `vp check`. The React Compiler fails the build on a component that breaks the
   rules of React, and the gallery uses the build, not the source.
7. Show every variant and size on its family's gallery page in `packages/gallery/src/pages`, and test it in the page's
   test file: its role and accessible name, its variants, and, for a control, its 24 px target in the compact density.

## Adding an icon

An icon is copied from lucide-react 1.70.0, the version the other icons came from, under lucide's name.

To add one:

1. In a scratch folder outside the repo, download the package with `npm pack lucide-react@1.70.0` and unpack it with
   `tar xzf lucide-react-1.70.0.tgz`. The icon is `package/dist/esm/icons/NAME.mjs`, where `NAME` is lucide's
   kebab-case name, such as `ellipsis`: its shapes are the `node` array, and its older names the `aliases` array, such
   as `more-horizontal`, if it has one.
2. Copy `src/vendor/lucide/copy.tsx` to `src/vendor/lucide/NAME.tsx`, and change its header line's name, its JSDoc,
   its component's name (lucide's current name with `Icon` after it, such as `CopyIcon`) and its shapes. Write each
   shape as a JSX element with lucide's attributes, leaving out `key`. If `src/vendor/lucide/LICENSE` lists the icon,
   or one of its older names, among those lucide took from Feather, its header says so, as `chevron-down.tsx`'s does.
3. Export it from the icons block of `src/index.ts` under its current name and each older name, each in Pascal case
   with `Icon` after it, as lucide-react exports them:

   ```ts
   export { EllipsisIcon, EllipsisIcon as MoreHorizontalIcon } from "./vendor/lucide/ellipsis.tsx";
   ```

4. Import it under its current name in `packages/gallery/src/pages/icons.tsx` and add that name to the page's `icons`
   object; its older names need no entry. The page's test fails while an exported icon is missing from the page.
5. Run `vp run @basis/ui#build`, then `vp run -r test`. `tests/icons.test.tsx` checks that every `*Icon` export renders
   lucide's SVG.

## Vendored code

`src/vendor` holds small, stable code copied from upstream, which `@basis/ui` keeps instead of depending on it. Each
folder holds the upstream license, which the published package carries, and each file opens with the upstream package,
its version and its license.

| Folder              | Upstream                                 | License                                             | Changed                                                                                                                    |
| ------------------- | ---------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/vendor/clsx`   | `clsx` 2.1.1                             | MIT                                                 | Rewritten in strict TypeScript, giving the package's output                                                                |
| `src/vendor/cva`    | `class-variance-authority` 0.7.1         | Apache-2.0                                          | Rewritten in strict TypeScript, giving the package's output; `cx` left out; still named `cva`, which `@shadcn/lint` reads  |
| `src/vendor/lucide` | `lucide-react` 1.70.0, some of its icons | ISC, and MIT for the icons lucide took from Feather | One `Icon` base without lucide-react's `size`, `color` and stroke props, its context, its `lucide` classes or its children |

`tests/vendor.test.ts` holds clsx's and cva's behaviour, and `tests/icons.test.tsx` the icons'. To move to a newer
upstream version, copy its changes in, update the headers' versions, and run the tests.
