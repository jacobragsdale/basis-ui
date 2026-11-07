# @basis/ui

The firm's React design system and toolchain: the theme, the components and their icons, the Vite+ preset, the app
shell (`BasisApp`, sign-in, telemetry and error display), the generated API client's configuration and tasks, and the
numbers, dates, securities and utils modules. [The basis-ui design](../../docs/design.md) holds the decisions behind
them.

## How to build an app on @basis/ui

An app takes its checks, its plugins, its stylesheet, its components and its icons from this one package, and declares
no styles of its own. basis-ui's `packages/gallery` is an app built this way, and `packages/example` is one that also
calls an API, through the app shell and a generated client.

Prerequisites: an app repo, in git, with `react` and `react-dom` 19.3, `@tanstack/react-query` 5, `@tanstack/react-router`
1 and `zod` 4 as dependencies, and `vite-plus` 1.5.0, TypeScript 7.0, `msw` 3 and `@faker-js/faker` 10 as dev
dependencies. Until roadmap step 1.8 publishes `@basis/ui`, install it from a tarball made with `vp pm pack` in this
package.

orval, which generates the client, brings TypeScript 6 with it, through `@orval/zod` and `@orval/hono`. Keep one
TypeScript in the tree by overriding it in `pnpm-workspace.yaml`, then reinstall and check that `pnpm why typescript`
finds one version, again after each orval upgrade. orval also brings esbuild, whose install script pnpm refuses to run
unless told; it only checks the binary pnpm installs anyway, so tell pnpm not to run it:

```yaml
overrides:
  typescript: 7.0.2 # the app's own TypeScript
allowBuilds:
  esbuild: false
```

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

## Starting the app

`BasisApp` is the app: it signs the user in, then renders the router's routes inside the providers every app shares.
An app's entry point and router are these two files:

```tsx
// src/router.ts
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routes.ts";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export { router };
```

```tsx
// src/main.tsx
import "./styles.css";
import { BasisApp, fakeSignIn } from "@basis/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./router.ts";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("index.html has no #root element for the app to render into.");
}
createRoot(root).render(
  <StrictMode>
    <BasisApp router={router} signIn={fakeSignIn()} />
  </StrictMode>,
);
```

`BasisApp` takes:

| Prop          | What it is                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `router`      | The app's TanStack Router. Its routes render once the user is known.                                   |
| `signIn`      | The sign-in adapter: the firm's (roadmap step 1.9), or `fakeSignIn()` in tests and development.        |
| `telemetry`   | Where errors, events and timings go; `consoleTelemetry` by default.                                    |
| `queryClient` | The TanStack Query client, for a test that reads its cache; one from `createQueryClient()` by default. |

Inside it, in order: the telemetry, the query client, the toasts (`Toaster`), an error boundary round the whole app,
the signed-in session, and the router. It keeps the page in the user's mode and density as they change them
(`followPreferences`), and gives `apiFetch` the adapter's token, so every request carries the user's JWT.

- **Queries.** `createQueryClient()` keeps data fresh for 30 seconds and retries a query twice, but only after a
  network failure or a 502, 503 or 504, which basis's contract says may pass; a 4xx, a 500 or a response its schema
  refused shows at once. Mutations never retry.
- **Routes.** Unless the router sets its own, `BasisApp` gives it an error component, which shows the error on an
  `ErrorAlert` with "Try again", and a not-found page that links to `/`.
- **Session.** `useSession()` returns `{ user, signOut }`. `signOut()` signs out through the adapter, drops every
  cached response, which was the user's, and asks again for what the page shows.
- **Telemetry.** `useTelemetry()` returns `{ error, event, timing }`. `BasisApp` reports each error its boundary, the
  router or a failed query or mutation meets, with a `source` attribute (`render`, `route`, `query`, `mutation`,
  `sign-in`), and each navigation's time as `navigation`. An app reports its own: `useTelemetry().event("position.booked",
  { book })`. The firm's collector will be a `Telemetry` of its own; `consoleTelemetry` writes to the console.

A sign-in adapter is three functions, `{ currentUser, token, signOut }`: `currentUser()` resolves the signed-in `User`
(`{ id, name, email? }`) or `null`, and `BasisApp` shows nothing of the app until it does; `token()` resolves the JWT
for the next request, or `null`; `signOut()` ends the session. `fakeSignIn({ user, issuer, audience, claims })` signs
in `user` at once (a placeholder user by default, `null` for an anonymous one) and signs each token with the
development key basis publishes, so a basis API on a developer's desktop, such as `basis dev`'s, accepts it when
`issuer` and `audience` match its `BASIS_IDENTITY__ISSUER` and `BASIS_IDENTITY__AUDIENCE` (`basis-development` by
default). Every other API refuses it.

## Calling the API

The client is generated by orval from the app's `openapi.json`, the pinned copy of its API's document, into
`src/api/generated`, which no one edits. Copy the document and generate the client with `vp run client-pull`:

```sh
vp run client-pull ../positions-api v1.4.0                         # from a clone of the API repo, at a tag
vp run client-pull https://positions.example/api/openapi.json      # from a deployed API
vp run client-pull                                                 # regenerate from the openapi.json already here
```

To run `vp dev` against a live API, such as `basis dev`'s on the desktop, set `BASIS_API_URL` to its address, as in
`BASIS_API_URL=http://127.0.0.1:8000 vp dev`: the preset sends `/api` to it with the prefix removed, as the ingress
does, and `fakeSignIn()`'s tokens sign the user in.

`vp run client-check`, which `vp run check-full` runs first, fails when `src/api/generated` is not what `openapi.json`
generates, one line for each file. Its fix is `vp run client-pull`. `@basis/ui/orval` exports `basisOrval()`, the
configuration both tasks use, from spike 0.2: a Zod 4 schema for each model, which drops fields it does not know, a
TanStack Query v5 hook for each operation, with every response parsed by its schema, and MSW handlers for each
operation and status. Two settings never change: `zod.strict` stays off, since it would make every response refuse a
new field, and `override.zod.schemaExtension` is never set, since it is the one path on which orval calls TypeScript's
compiler API, which TypeScript 7 does not have.

Code outside `src/api` imports the client through two files of the app's own, which re-export the generated ones:

```ts
// src/api/client.ts
/* oxlint-disable oxc/no-barrel-file -- the generated client's whole surface, which changes on every pull. */
export * from "./generated/client.ts";
export * from "./generated/model/index.ts";
```

```ts
// src/api/mocks.ts: the MSW handlers, for tests and fixture mode
// oxlint-disable-next-line oxc/no-barrel-file -- the generated handlers, which change on every pull.
export * from "./generated/client.msw.ts";
```

The preset's lint keeps feature code on them: outside `src/api`, `fetch` (also as `globalThis.fetch`), `axios` and any
import of `api/generated` fail with the import to use instead.

A hook returns the response as `{ data, status, headers }`, so a component reads `query.data.data`, and its error is an
`ApiError` holding the API's problem details. Show it with `ErrorAlert`, which renders nothing while there is no error:

```tsx
import { ErrorAlert } from "@basis/ui";
import { useGetPositions } from "#api/client.ts";

const positions = useGetPositions();

<ErrorAlert
  error={positions.error}
  onRetry={() => {
    positions.refetch().catch(reportError);
  }}
/>;
```

`ErrorAlert` shows the problem's title, its detail, each field a 422 names (`legs[0].price: Must be positive`) and the
request's reference, and words of its own for a lost connection or a response that broke its schema. A failed
mutation raises a toast of the same words through `toastError`, unless the mutation says otherwise, as a form that puts
the errors on its fields does:

```ts
useCreatePosition({ mutation: { meta: { errorToast: false } } });
```

`describeError(error)` gives the same words, `{ title, detail, fields, reference }`, for a display of an app's own.

A dataset route, one whose success lists Arrow, is generated to ask for Arrow, and its hook's data is a `Blob` of the
Arrow IPC stream.

In tests, MSW's service worker stands in for the API: `basisPlugins()` serves its script in `vp dev` and `vp test`
only. Start it once in a test helper, add each test's handlers, and render the app at an address:

```tsx
import { setupWorker } from "msw/browser";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { getGetPositionsMockHandler } from "#api/mocks.ts";

const worker = setupWorker();
await worker.start({ onUnhandledFrame: "bypass", quiet: true });

worker.use(getGetPositionsMockHandler([position]));
const router = createRouter({ history: createMemoryHistory({ initialEntries: ["/"] }), routeTree });
await render(<BasisApp router={router} signIn={fakeSignIn()} />);
```

`packages/example`'s `src/test-support.tsx` and its tests do this in full.

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

Text takes its look from the Typography components (`TypographyH1` to `TypographyH4`, `TypographyP`, `TypographyLead`,
`TypographyMuted`, `TypographyInlineCode` and `TypographyList`), never from classes on a plain element. `render`
changes a heading's level and keeps its look, as in `<TypographyH2 render={<h3>Risk</h3>} />`. In a `Table`, a column
of numbers takes `variant="numeric"` on its `TableHead` and each `TableCell`, which aligns it right in tabular figures.

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

## Laying out an app

The navigation and layout components keep shadcn's names, props and parts. Where they differ, it is here:

- **Sidebar.** `SidebarProvider` keeps whether the sidebar is open in the `basis-ui-sidebar` cookie for a week, and
  reads it back on load, so the user's last choice wins over `defaultOpen`; an app passes no cookie to it. Ctrl+B, or
  Cmd+B on a Mac, toggles it. It folds to its icon rail or off the canvas at once, with no animation. A sidebar on the
  right comes after `SidebarInset` in the provider, so its gap sits on the right. `SidebarInset` is the page's
  `<main>`; where a layout already has one, `render={<div />}` makes it a `<div>`.
- **Resizable.** It is @basis/ui's own build on the WAI-ARIA window splitter pattern, with no dependency, and sizes
  are percentages as plain numbers from 0 to 100: `defaultSize={30}` is 30 percent, where react-resizable-panels 4
  would read pixels. Give each `ResizableHandle` an `aria-label`, such as "Resize the trade list". To keep a layout,
  give each panel an `id`, store what `onLayoutChanged` reports after a drag or a key, and pass it back as
  `defaultLayout`:

  ```tsx
  <ResizablePanelGroup defaultLayout={stored} onLayoutChanged={store}>
    <ResizablePanel id="trades" defaultSize={40} minSize={20} maxSize={70}>
      …
    </ResizablePanel>
    <ResizableHandle withHandle aria-label="Resize the trade list" />
    <ResizablePanel id="detail" minSize={30}>
      …
    </ResizablePanel>
  </ResizablePanelGroup>
  ```

- **Navigation Menu.** A top-level link takes `variant="trigger"` to look like the triggers beside it, where shadcn
  puts `navigationMenuTriggerStyle()` on it; give the menu an `aria-label`.
- **Links.** `BreadcrumbLink`, `PaginationLink`, `PaginationPrevious`, `PaginationNext`, `SidebarMenuButton` and
  `SidebarMenuSubButton` take `render` for the router's link, as in `<BreadcrumbLink render={<Link to="/desks" />}>`.
  A page link is a `ButtonLink`, and takes Button's `size`.
- **Keys.** Tabs move focus with the arrow keys and open the focused tab on Enter or Space. Accordion triggers are
  buttons in the tab order, without arrow-key movement between them, as Base UI 1.9 follows the WAI-ARIA authoring
  practices.

## Raising a toast

Render `<Toaster />` once, around the app or beside its routes, and raise a toast from anywhere, inside React or out,
with `toast`:

```tsx
import { Toaster, toast } from "@basis/ui";

<Toaster />;

toast.add({ title: "Trade booked", description: "Bought 5,000 par at 99-16.", type: "success" });
toast.promise(save(), { loading: "Saving", success: "Saved", error: "Not saved" });
```

`type` picks the look: `success`, `warning`, `info` and `destructive` (or `error`, which `toast.promise` sets) each
show their status colour and icon, `loading` a turning loader, and anything else the plain toast. A toast closes
itself after five seconds unless `timeout` says otherwise; `timeout: 0` keeps it until the user closes it. Its
`actionProps`, such as `{ children: "Undo", onClick: restore }`, add a button. `priority: "high"` announces it to a
screen reader at once, for what the user must act on now. F6 moves the keyboard into the toasts, and Escape closes the
focused one.

## Showing numbers and dates

`Num`, `Money`, `Pct`, `Bps`, `Price32` and `DateTime` show a value through the formatter, by parallax's rules, so it
reads the same in a card as in the grid. Pass `value` as the API sends it: decimal text, a `Decimal`, a double or a
bigint, and for `DateTime` a Temporal value or ISO 8601 text. `null` shows the formatter's null text, which is empty.

```tsx
import { Bps, DateTime, Money, Num, Pct, Price32 } from "@basis/ui";

<Num value="1234.50" />; // 1,234.50: decimal text keeps its scale
<Money value="-1234.5" />; // -$1,234.50
<Money value="2500000000" abbreviate="B" />; // $2.5B
<Pct value="0.0525" />; // 5.25%
<Bps value="0.0025" />; // 25 bp
<Price32 value="99.515625" />; // 99-16+
<DateTime value="2026-11-06T14:30:00Z" />; // 2026-11-06 09:30:00, in New York time
<Num value={pnl} signed />; // +1,250.50 in the gain colour, -1,250.50 in the loss colour
```

- **Rates** are fractions, as the formatter's `percent` and `rateSuffixes` read them: 0.0525 is 5.25% and 0.0025 is
  25 bp. A value already in percent or basis points takes `unit="percent"` or `unit="bp"`.
- **Money** takes an ISO 4217 `currency`, USD unless set, which gives the symbol, written after the sign, and the
  decimals: `€1,234.50`, `¥1,234`, `($1,234.50)` with `negative="parentheses"`.
- **`signed`** colours a gain and a loss with the `gain` and `loss` tokens and always writes the sign. The direction is
  the shown value's, so 0.001 at two decimals is `0.00`, in neither colour.
- **Figures** are tabular. `align="end"` makes a number a block aligned right, for a column of figures outside a
  table; in a `Table`, the cell's `variant="numeric"` aligns it.
- **`DateTime`** takes `zone`, `precision` (`seconds`, `milliseconds` or `microseconds`) and `show` (`date-time`,
  `date` or `time`). Text with an offset or `Z` is an instant, a bare date is a date, and a time without either is a
  wall-clock time shown as stored. It renders a `<time>` whose title gives the full instant with its offset and zone.
- Text that is not a decimal, or not ISO 8601, throws, as `Decimal.from` and Temporal do: the response's schema should
  have refused it.

## Taking amounts and dates

`AmountInput`, `AsOfDatePicker` and `DateRangePicker` each go in a `Field` with a `FieldLabel` whose `htmlFor` is
their `id`. The first two draw their field's error line themselves, so a form passes them the field's errors as
`errors` rather than drawing a `FieldError` of its own; while what was typed cannot be taken, their own reason replaces
those errors.

`AmountInput` reads what is typed through `parseAmount` with the suffixes it declares, `amountSuffixes` unless set,
and shows the number it read under the input, such as `= 1,500,000`. Bond markets write `M` for thousands, so a par
field declares `parSuffixes`, and a spread `rateSuffixes`. Its value is the exact decimal string, `null` while it is
empty, and the text itself while that reads as no number, which `amountSchema` refuses with the parser's reason and
otherwise turns into the decimal:

```tsx
import { AmountInput, Field, FieldLabel, amountSchema, parSuffixes, rateSuffixes } from "@basis/ui";

const ticketSchema = z.object({
  par: amountSchema(parSuffixes), // "Enter an amount." when empty
  spread: amountSchema(rateSuffixes).nullable(),
});

<form.Field name="par">
  {(field) => {
    const invalid = field.state.meta.isTouched && !field.state.meta.isValid;
    return (
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor="par">Par</FieldLabel>
        <AmountInput
          id="par"
          suffixes={parSuffixes}
          value={field.state.value}
          onValueChange={field.handleChange}
          onBlur={field.handleBlur}
          aria-invalid={invalid}
          errors={invalid ? field.state.meta.errors : undefined}
        />
      </Field>
    );
  }}
</form.Field>;
```

`AsOfDatePicker` holds a `Temporal.PlainDate`. It takes business days on its `calendar`, SIFMA's unless set, from
`min` to `max`, where `max` is today in New York unless set and `null` leaves the future open. Uncontrolled, it starts
at the last business day before today, which `defaultAsOfDate()` also gives a form's default values. A typed
`2026-11-06` or `11/06/2026` is taken when the field is left or Enter pressed; a date it cannot take leaves the value
`null` and names the reason, such as `2026-11-11 is not a business day on the SIFMA (US bond market) calendar: it closes
for Veterans Day.` Its calendar button opens a month grid on the WAI-ARIA date picker dialog pattern: the arrows move a
day or a week, Home and End to the ends of the week, PageUp and PageDown a month and, with Shift, a year; Enter picks
and Escape closes. Closed days are muted, holidays also struck through, and early closes dotted, with the reason in each
day's name and title and under the grid.

`DateRangePicker` holds a `DateRange` from `@basis/ui/dates`, and offers presets beside the same grid: month, quarter
and year to date, and the prior month, quarter and year, each from its period's first business day to a business day,
counted from `asOf`, the last business day before today unless set. `presets` picks and orders them, and
`rangeForPreset` gives the same ranges outside the picker. Two days picked in the grid, in either order, make a range.

Pass `today` to fix the date both pickers count from, as the gallery and tests do.

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
