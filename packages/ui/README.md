# @basis/ui

The firm's React design system and toolchain: the theme, the components and their icons, the Vite+ preset, the
numbers and utils modules, and the pieces of the app shell built so far (the formatter, the client's fetch, and the
mode and density preferences). [The basis-ui design](../../docs/design.md) holds the decisions behind them.

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
carries `min-h-target` and `min-w-target`. A control drawn smaller than that, such as Checkbox's 16 px box, Switch's
track or Slider's thumb, is a 24 px target with its shape drawn inside it, so it keeps shadcn's look.

## Building a form

A form's state is TanStack Form's, its schema Zod's, and its look `Field`'s. Each field passes `data-invalid` to
`Field`, `aria-invalid` to its control, and its errors to `FieldError`, which shows them in words, as a line or a
list, so an invalid field is never told by colour alone:

```tsx
import { Field, FieldError, FieldLabel, Input, fieldErrors } from "@basis/ui";
import { useForm } from "@tanstack/react-form";

const form = useForm({
  defaultValues: { cusip: "" },
  validators: {
    onChange: orderSchema,
    // A 422's errors, on the fields their JSON Pointers name.
    onSubmitAsync: async ({ value }) => {
      const problem = await placeOrder(value);
      return problem === undefined
        ? undefined
        : { fields: Object.fromEntries(fieldErrors(problem)) };
    },
  },
});

<form.Field name="cusip">
  {(field) => {
    const invalid = field.state.meta.isTouched && !field.state.meta.isValid;
    return (
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor="cusip">CUSIP</FieldLabel>
        <Input
          id="cusip"
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(event) => {
            field.handleChange(event.target.value);
          }}
          aria-invalid={invalid}
          aria-describedby="cusip-error"
        />
        <FieldError id="cusip-error" errors={invalid ? field.state.meta.errors : undefined} />
      </Field>
    );
  }}
</form.Field>;
```

`FieldError` takes a schema's issues, the strings `fieldErrors` returns, and the lists TanStack Form types a form
validator's field errors as. `fieldErrors` names each field as TanStack Form does, such as `legs[0].price` for the
pointer `#/legs/0/price`, so its entries go straight to the fields; `fieldName` does the same for one path.
The gallery's forms and inputs page holds a whole order ticket, with its tests.

## Using overlays and menus

Dialog, Alert Dialog, Sheet, Drawer, Popover, Hover Card, Tooltip, Dropdown Menu, Context Menu, Menubar and Command
are shadcn's, on Base UI, and open, close, trap and return focus as Base UI does. A trigger renders as a Button through
`render`, and the trigger keeps its own text:

```tsx
import { Button, Dialog, DialogContent, DialogTitle, DialogTrigger } from "@basis/ui";

<Dialog>
  <DialogTrigger render={<Button variant="outline" />}>Edit position</DialogTrigger>
  <DialogContent>
    <DialogTitle>Edit position</DialogTitle>
  </DialogContent>
</Dialog>;
```

Where these differ from what shadcn's documentation leads one to expect:

- `AlertDialogAction` is a button that does not close the dialog. Control `open`, and close it in the action's handler
  once the action has run; `AlertDialogCancel` closes it.
- `Command` is built on Base UI's Autocomplete, not cmdk. An item matches when its `value`, or its text without its
  `CommandShortcut`, or one of its `keywords` contains the search, ignoring case and accents, and the list keeps its
  order rather than sorting by a fuzzy score. The search cannot be controlled from outside; `shouldFilter={false}`
  shows every item, for a list the app filters itself. `onSelect` receives the item's value. Put a `Command` inside a
  `CommandDialog` for the palette, and close the dialog in `onSelect`.
- A `ContextMenuTrigger` should hold something focusable, such as a row's button or link, so a keyboard user can open
  the menu with the context-menu key or Shift+F10.
- A `Tooltip` names nothing for assistive technology, so an icon-only trigger still takes an `aria-label`, and a
  `HoverCard`'s content must also be reachable by following its link: neither reaches touch or screen reader users.
- A `Drawer` takes no snap points: placing the panel at one needs arbitrary values the theme does not allow.

Overlays animate with a short fade and scale, or a short slide for Sheet and Drawer, which stop under
`prefers-reduced-motion`. The gallery's overlays and menus page shows each one closed, with its tests beside it.

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

## Using the numbers and utils modules

`@basis/ui/numbers` and `@basis/ui/utils` hold what an app would otherwise add a decimal library or lodash for. Import
them by subpath:

```ts
import { Decimal, formatThirtySeconds, percentChange } from "@basis/ui/numbers";
import { debounce, sortBy, toCsv } from "@basis/ui/utils";
```

- Read the decimal strings an API sends with `Decimal.from`, and do the arithmetic on the `Decimal`, never on
  `Number(text)`. Division and `round` take a scale and round half away from zero, Excel's rounding, unless told
  otherwise; `Decimal.fromNumber` takes both explicitly. Show one through the formatter with
  `formatter.decimal(value.unscaled, value.scale)`, and give a chart `value.toNumber()`.
- `sumPrecise` adds doubles exactly, where adding them in turn would drift.
- Anything with a market convention, such as accrued interest, day counts, yields or risk, is the API's to compute.
- `utils` follows es-toolkit's signatures, and differs where the types would otherwise lie or lodash surprises:
  `keyBy`, `countBy` and `fromEntries` return `Partial` records, `zip` types the `undefined` it pads with, `throttle`
  never calls twice within its wait, and `sortBy` puts missing values last in either order.

The tests check `Decimal` and `sumPrecise` against `tests/fixtures/numbers.json`, which
`tests/fixtures/generate_numbers.py` writes with Python's `decimal` module. After changing the generator, rewrite the
fixtures from this package with `uv run tests/fixtures/generate_numbers.py` and commit both: the tests fail while the
fixtures are older than the generator.

## Dates and securities

`@basis/ui/dates` works on Temporal's types, with no date library: plain dates are `Temporal.PlainDate`, and instants
come back as `Temporal.ZonedDateTime` in New York time. Every query takes a calendar and uses SIFMA's, the US bond
market's, unless it names the NYSE's or TARGET2's:

```ts
import {
  addBusinessDays,
  marketStatus,
  nyse,
  settlementDate,
  sifma,
  target2,
} from "@basis/ui/dates";

const tradeDate = Temporal.PlainDate.from("2026-07-02");
settlementDate(tradeDate); // 2026-07-06: T+1 on SIFMA's calendar, over Independence Day
settlementDate(tradeDate, { calendar: target2, days: 2 });
addBusinessDays(tradeDate, -3, { calendar: nyse });
marketStatus(Temporal.Now.instant()).state; // "open", "early-close" or "closed"
sifma.day(Temporal.PlainDate.from("2026-11-27")); // an early close at 14:00, "After Thanksgiving Day"
```

| Calendar  | Rules from        | Tested against                                                            | Session                   |
| --------- | ----------------- | ------------------------------------------------------------------------- | ------------------------- |
| `sifma`   | sifma.org         | SIFMA's published recommendations for every year from 1996 to 2027        | 08:00 to 17:00, New York  |
| `nyse`    | parallax's Rust   | the fixtures the Rust writes, 2000 to 2050, and nyse.com for 2016 to 2028 | 09:30 to 16:00, New York  |
| `target2` | the ECB, Dec 2000 | the ECB's six closing days, 2000 to 2050                                  | 07:00 to 18:00, Frankfurt |

Each calendar is its rules, stated at the top of its module in `src/dates/`, plus a dated list of exceptions, each with
the notice behind it, since markets close on days no rule foresees. `publishedThrough` is the last year the publisher
had confirmed when the calendar was written; later years follow the rules. SIFMA publishes no regular session hours,
only closes, so its 8 a.m. to 5 p.m. session is the US bond venues' convention, as the calendar's `session.source` says.

To update a calendar when its publisher announces a year or an unscheduled close:

1. Add the exception or change the rule in `src/dates/`, with the notice's address as its `source`.
2. Add the published schedule to `tests/fixtures/calendars/sifma.json` or `nyse.json`, as one more source with its
   address, the day it was fetched, and the years it lists in full; raise the calendar's `publishedThrough`.
3. For the NYSE, change parallax's `calendar.rs` too, and rewrite its fixtures with
   `PARALLAX_UPDATE_FIXTURES=1 cargo test -p parallax-engine --test calendar_fixtures`.

`@basis/ui/securities` checks CUSIPs, ISINs and SEDOLs and their check digits. Its `Cusip`, `Isin` and `Sedol` types
are made only by `parseCusip`, `parseIsin` and `parseSedol`, which return the identifier or the reason it is not one,
so a ticker cannot reach a function that takes a `Cusip`:

```ts
import { cusipToIsin, parseCusip } from "@basis/ui/securities";

const reading = parseCusip(field.value);
if (reading.ok) {
  cusipToIsin(reading.value); // "US91282CRF04" for 91282CRF0
} else {
  showError(reading.reason);
}
```

## Adding a component

1. Port it from shadcn's Base UI source, keeping shadcn's names, props and parts, into
   `src/components/NAME.tsx`, or `NAME.ts` when it renders through `useRender` and holds no JSX. Replace every
   `dark:` class with a token and every arbitrary value with the theme's scales and opacity modifiers. Merge classes
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
   Leave no popup open on the page: an open Base UI Select or Combobox hides the rest of the page from assistive
   technology, and an open Select takes the focus, so the page would load scrolled to it. The tests open them instead.

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
