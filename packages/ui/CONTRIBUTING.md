# Contributing to @basis/ui

How `@basis/ui` itself is built and changed. An app's agent needs none of this: the package's
[README](README.md) says how an app uses it, and `vp run docs` prints that and the catalogue in an app. The decisions
behind the package are in [the basis-ui design](../../docs/design.md), and the build order in
[the roadmap](../../docs/roadmap.md). basis-ui's `packages/gallery` shows every component, in every theme, mode and
density, with its tests; `packages/example` is an app on the app shell with a generated client and fixtures, and
`packages/consumer` an app configured by hand with exactly the README's lines.

Run `vp run @basis/ui#build` before the gallery's or the example's checks: they read the build, not the source.

## The changelog

`CHANGELOG.md` ships in the package, and `vp run docs ui/changelog` prints it in an app. A change an app or ctzd sees,
in a component's props, a task, an error's text, the catalogue or the configuration the README shows, adds a line
under `## Unreleased`, in the words an app's agent needs: what changed and what to do about it. A release renames
`Unreleased` to its version and date.

## Adding a component

1. Port it from shadcn's Base UI source, keeping shadcn's names, props and parts, into
   `src/components/NAME.tsx`, or `NAME.ts` when it renders through `useRender` and holds no JSX. Replace every
   `dark:` class with a token and every arbitrary value with the theme's scales. Draw every colour whole from a token:
   a test fails on an opacity modifier such as `hover:bg-primary/80`, so take the theme's token for it (see [The
   theme's tokens](README.md#the-themes-tokens)). Merge classes
   with `cn` from the `cn` package, as shadcn does; take `cva` from `#vendor/cva/cva.ts`, and each icon from its file
   in `src/vendor/lucide`, such as `#vendor/lucide/chevron-down.tsx`.

   shadcn's source names its look in `cn-*` classes that its styles define; the components here take its nova style's,
   as `@jacobragsdale/ui`'s do. shadcn's Tailwind setup also brings `tw-animate-css` and the variants in
   `shadcn/tailwind.css`, and the theme has neither: write `data-[orientation=horizontal]:` for `data-horizontal:`,
   since Tailwind still generates the latter and the lint passes it, but it never matches Base UI's attributes; and
   fade or scale a popup with `transition` and Base UI's `data-starting-style` and `data-ending-style` in place of
   `animate-in`, `fade-in-0` and `zoom-in-95`.

2. Put its `cva` classes in `src/components/NAME-variants.ts`, each named after the component or part it styles, such
   as `buttonVariants` for `Button` or `selectTriggerVariants` for `SelectTrigger`: `@shadcn/lint` finds a component's
   variants by that name, and a component file exports only components (`react/only-export-components`). A part with
   no `variant` or `size` needs no `cva`. Other `@basis/ui` components may import the variants; the package never
   exports them, which `tests/exports.test.ts` checks.
3. If the component takes another component's `variant` and `size`, as `ButtonLink` takes Button's, import that
   component's variants under this one's name, so that the catalogue lists them, and `shadcn/no-restyle`'s errors,
   which the preset writes from the catalogue, with it:

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
   Leave no popup open on the page: an open Base UI Select or Combobox hides the rest of the page from assistive
   technology, and an open Select takes the focus, so the page would load scrolled to it. The tests open them instead.
   The screenshots open them: give an overlay `defaultOpen={usePictured()}`, true when the page shows its section
   alone, and spread `hovered`, `focused` or `pressed` from `pages/shot.ts` onto an example of that state. Then run `vp
   run @basis/gallery#shots --update`, look at the section's new screenshots, and commit them; `vp run
   @basis/gallery#shots` compares every section's with them, in both modes and densities, and runs axe on it.
8. Give each exported component a doc comment saying what it is for, and each prop one saying what it does. Give the
   family's main component `@use`, `@see` and an `@example`: a module that imports from `@basis/ui` and ends in the
   component's JSX, with `//` comments only, since `*/` would end the doc comment. Then run
   `vp run @basis/ui#catalogue` and commit `catalogue.json`, and add a line to `CHANGELOG.md`.

## The component catalogue

`catalogue.json`, which the package ships as `@basis/ui/catalogue.json` and `vp run docs` reads, is written from the
source of `@basis/ui` and `@basis/parallax` by `src/catalogue/`, with oxc's parser, and from Base UI's declaration
files, whose props a component built on a Base UI part takes. `vp run @basis/ui#catalogue` writes it; commit it with
the change. Parallax's entries are read from its source here, so `@basis/ui` never depends on parallax: the two release
together, so the entries match the parallax an app installs.

Each entry's text is a doc comment: a component's or function's purpose is its summary, `@use` says when to use it and
what to use instead, `@see` lists what goes with it from other families and modules, comma-separated, and the family's
main component carries the `@example`. A prop's description is the doc comment on its property, a `@default` its
default; `className`, `children`, `id`, `inset` and a menu item's destructive `variant` share one description each,
in `src/catalogue/build.ts`. A Zod schema's fields, as parallax's `LayoutInput`'s, take the doc comments on the
schema's properties.

`tests/catalogue.test.ts` fails while the file is stale, when an entry has no doc comment, when a prop the packages
declare has none, when a family has no example, when an example does not compile in `packages/consumer`, the app
configured exactly as the README says, or when a prop the catalogue lists is one the component does not take: a probe
module, written beside the examples, holds each listed prop to the component's props, so a prop read wrongly from Base
UI's declarations names itself. Parallax's examples compile against its source through a path mapping.

`vp run docs` is `src/preset/docs.ts`, and its errors are tested by their text in `tests/preset-errors.test.ts`.

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

| Folder                   | Upstream                                                                   | License                                             | Changed                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/vendor/clsx`        | `clsx` 2.1.1                                                               | MIT                                                 | Rewritten in strict TypeScript, giving the package's output                                                                |
| `src/vendor/cva`         | `class-variance-authority` 0.7.1                                           | Apache-2.0                                          | Rewritten in strict TypeScript, giving the package's output; `cx` left out; still named `cva`, which `@shadcn/lint` reads  |
| `src/vendor/lucide`      | `lucide-react` 1.70.0, some of its icons                                   | ISC, and MIT for the icons lucide took from Feather | One `Icon` base without lucide-react's `size`, `color` and stroke props, its context, its `lucide` classes or its children |
| `src/vendor/sum-precise` | The `Math.sumPrecise` polyfill in `tc39/proposal-math-sum`, commit 77d52dc | BSD-3-Clause                                        | Rewritten in strict TypeScript, giving the polyfill's results; without its RangeError at 2^53 carries                      |

`tests/vendor.test.ts` holds clsx's and cva's behaviour, `tests/icons.test.tsx` the icons', and
`tests/sum-precise.test.ts` and `tests/numbers-oracle.test.ts` the sum's. To move to a newer upstream version, copy its
changes in, update the headers' versions, and run the tests.

## The numbers fixtures

The tests check `sumPrecise` against `tests/fixtures/numbers.json`, which `tests/fixtures/generate_numbers.py` writes
with exact rational sums in Python. After changing the generator, rewrite the fixtures from this package with
`uv run tests/fixtures/generate_numbers.py` and commit both: the tests fail while the fixtures are older than the
generator.

## The fixture record format

`src/fixtures/record.ts` holds the format, as the Zod schema fixture mode parses with, and
`schema/fixture-record.schema.json` its JSON Schema, which the package ships. After changing the format, rewrite the
JSON Schema with `vp run @basis/ui#fixture-schema` and commit both, since a test fails while they differ. A change that
refuses a record the format accepted before is a new version, `basis-ui-fixture/2`, and basis is told.

## The calendars

Each calendar's rules are stated at the top of its module in `src/dates/`, with its exceptions below them.

To update a calendar when its publisher announces a year or an unscheduled close:

1. Add the exception or change the rule in `src/dates/`, with the notice's address as its `source`.
2. Add the published schedule to `tests/fixtures/calendars/sifma.json` or `nyse.json`, as one more source with its
   address, the day it was fetched, and the years it lists in full; raise the calendar's `publishedThrough`.
3. For the NYSE, change parallax's `calendar.rs` too, and rewrite its fixtures with
   `PARALLAX_UPDATE_FIXTURES=1 cargo test -p parallax-engine --test calendar_fixtures`.
