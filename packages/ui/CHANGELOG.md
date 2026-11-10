# Changelog

What changed in `@basis/ui`, newest first, in the words an app's agent needs: what changed, and what to do about it.
`vp run docs ui/changelog` prints it in an app. It starts with the version after 0.0.0; nothing before is listed.

## Unreleased

- `vp run shot` explains what it pictured. Beside `NAME.png`, `NAME.aria.yml` and `NAME.console.txt` it writes
  `NAME.network.txt`, each request to `/api` with its status and what answered it (`record`, `fixture` with its file,
  `generated`, `none` or `live`), and `NAME.axe.txt`, axe's accessibility check, whose every violation fails the shot
  with the rule, the element and the fix. New options: `--mode light|dark` and `--density compact|comfortable` (set
  through the preferences cookie; `--dark` and `--comfortable` still work), `--theme default`, `--selector CSS` for one
  element, several routes at once, `--all` for every route of the router, `--step` to click, hover, type, press or wait
  before the picture, as `--step 'click:Save'`, `--compare DIR` against baselines, with the count of changed pixels and
  `NAME.diff.png`, and `--json`, one line of the type `ShotReport` from `@basis/ui/preset`. What to do: run `vp run
  sync` for the new `drive-the-app` skill, and fix what `NAME.axe.txt` lists; a page that fails only on the shell's
  landmarks waits for the shell's fix. Fixture mode's answers now carry `x-basis-fixture-source` and
  `x-basis-fixture-file` headers.
- `vp run verify` runs every check, each stage to its end, then prints one summary: sync, client, fixtures, config,
  lint, types, tests, build, budget and suppressions, each failure one `ERROR` line with its file and line where the
  tool gives them. `--stage NAME`, once for each, runs those stages alone, and `--json` prints the report as one line
  of JSON, the type `VerifyReport` from `@basis/ui/preset`. `vp run check-full` is now `vp run verify`: it still runs,
  saying so, so call `vp run verify` instead. The commit hook now runs `vp staged` and verify's fast stages, a few
  seconds, and the push hook every stage; run `vp run sync` to write the new hooks and the framework files' new first
  line, which names `vp run verify`. An app with no test file now fails the tests stage: write a test of each page.
- The lint and the drift check close what probes found open, each with an `ERROR` line that ends in its fix. What an
  app must change: remove every `oxlint-disable` and `eslint-disable` comment but `oxc/no-barrel-file`'s in
  `src/api`, and every `@ts-expect-error`, `@ts-ignore` and `@ts-nocheck`, fixing what they hid (`basis/no-suppressions`,
  and the new suppressions step of `vp run check-full`, now `vp run verify`, which `vp run review` counts); on a plain element, drop `dark:`,
  `!`, selector variants such as `[&>*]:`, filters such as `grayscale` and `brightness-50`, `black` and `white`, and
  classes built from template strings (`basis/theme-classes`); show dates with `DateTime` or `relativeTime`, not
  `toLocaleDateString`, `toLocaleTimeString`, `Intl.DateTimeFormat` or `Intl.RelativeTimeFormat`, and round to a step
  with `roundToTick`, not `Math.ceil(n * 100) / 100` (`basis/no-hand-rounding`); call the API only through the
  generated client, with no `fetch` in `src/api` and no `XMLHttpRequest`, `WebSocket`, `EventSource` or
  `navigator.sendBeacon` (`basis/no-fetch`); and import none of `recharts`, `react-hook-form`, `sonner` or React Aria.
  `vp run sync` now writes `.gitignore`, `src/styles.css` and `tsconfig.json`, and `vite.config.ts` when it is
  missing, and `vp run sync --check` fails on a `vite.config.ts` beyond the preset, its plugins, its tests, a budget and
  `basisTest({ browser: false })`, and on a dependency that is not on `@basis/ui`'s list: run `vp run sync`, then fix
  what it still reports. `no-unknown-classes`, `no-arbitrary-values` and `no-inline-styles` no longer suggest declaring
  anything in `src/styles.css`, and `typescript/ban-ts-comment` and `typescript/prefer-ts-expect-error` are off in app
  code, since `basis/no-suppressions` refuses every `@ts-` comment.
- The lint asks less of a page and says more when it refuses one. In app code a function may run to 200 lines,
  blanks and comments aside, with a complexity of 30 and 4 parameters; `a`, `b`, `e`, `k`, `v` and `_` are names; a
  number inside JSX needs no name; and only exported functions need a return type. A class that restyles a component
  names its variants and sizes and `vp run docs NAME`; a raw colour or a missing shadow names the tokens it means,
  such as `text-loss` or `bg-destructive` for red, and `shadow-sm` or `shadow-md`; `fetch` is refused by
  `basis/no-fetch`, so a disable comment for it names that rule, not `eslint/no-restricted-globals`.
- `vp run docs NAME` prints one component, hook, function, type or module from the installed catalogue, such as
  `vp run docs Select`, `vp run docs numberText`, `vp run docs DataTableColumn` or `vp run docs dates`: what it is for,
  when to use it, what goes with it, its props with their defaults, its variants and an example. `vp run docs --search
  WORDS` finds entries and README sections by what they are for, and `--json` prints either as JSON. A name it does not
  have fails with the closest names it has. README sections print as before, by `ui/SLUG` or `SLUG`.
- `@basis/ui/catalogue.json` is now `basis-ui-catalogue/2`. A component lists the props it takes from Base UI, with
  `from: "@base-ui/react"` and their `default`, so `Select` shows `items`, `value` and `onValueChange`; `extends` keeps
  only what is not listed, such as `ComponentProps<"div">`. Components gain `module`, `use` and `with`. New lists:
  `functions` (hooks, functions, classes and constants, with signatures), `types` (every type an entry names, with its
  fields, such as `DataTableColumn` and `DisplayFormat`) and `modules` (each subpath and what it is for).
  `@basis/parallax`'s components, hooks and types, every `LayoutInput` field among them, are in it under
  `module: "@basis/parallax"`. A reader of format 1 reads `components[].props` and `icons` as before.
- The README holds only what an app needs. How the package is built and how a component or icon is added moved to
  basis-ui's `packages/ui/CONTRIBUTING.md`, which does not ship.
