# Changelog

What changed in `@basis/ui`, newest first, in the words an app's agent needs: what changed, and what to do about it.
`vp run docs ui/changelog` prints it in an app. It starts with the version after 0.0.0; nothing before is listed.

## Unreleased

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
