# Agent guide

This repo is a UI on `@basis/ui` and `@basis/parallax`, made from the `@basis/create` template. Its `vite.config.ts` is
the preset's, so it checks, builds and tests as every basis-ui app does; `@basis/ui`'s README says what the preset
gives and how an app uses its components.

## Checks

```sh
vp install              # once per clone: installs dependencies and the commit hook (.vite-hooks/pre-commit)
vp run check-full       # the generated client against openapi.json, tsc, vp check (format, lint, types), vp test
vp test                 # the tests in headless Chromium; BASIS_TEST_DOM=node vp test runs them in a Node DOM
vp build                # dist/, with FILE.br and FILE.gz beside each built file over 1 KB
```

The commit hook runs `vp staged`, `vp check` and `vp test`. Never skip it with `--no-verify`.

## Running the app

- `vp dev` serves the app on a port of its own, derived from the folder's name, in fixture mode: no backend, `/api`
  answered from the records in `.fixtures/`, then the synthetic responses in `fixtures/`, then the generated client's
  handlers. Fixture mode answers once the API's document is copied to `openapi.json` with `vp run client-pull`.
- `BASIS_API_URL=http://127.0.0.1:8000 vp dev` calls a live API instead, with `/api` removed from each path.
- `vp run shot ROUTE`, such as `vp run shot /` or `vp run shot "/positions?book=rates" --dark`, pictures a route of
  the running `vp dev` in headless Chromium and writes its screenshot, accessibility tree and console errors to
  `.shots/`. The drive-the-app skill says how to click through the app with Playwright CLI.

## Writing the app

- A page is a route in `src/routes.ts`; its `staticData` title and icon put it in the sidebar, the breadcrumbs and the
  command palette.
- Numbers stay as the API sends them until they are displayed: never round, scale or format a value before the
  component that shows it, which formats it with `@basis/ui`'s display formats.
- Tests are written with `@basis/ui/testing`, so they run in Chromium and in a Node DOM. A test that needs a real
  browser, such as one of layout or canvas, is named `*.browser.test.tsx`, and runs only in Chromium.
- `.fixtures/` holds records exported from an API's run store, which hold client data: it is never committed.
