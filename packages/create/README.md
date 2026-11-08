# @basis/create

The template a UI repo is made from, for an app on `@basis/ui` and `@basis/parallax`:

```sh
vp create @basis:app --directory positions-ui
```

`vp create` reads it from the registry the repo's `.npmrc` names for the `@basis` scope, which waits for roadmap step
1.8. The app it makes is `templates/app`:

- the preset's configuration with exactly the lines `@basis/ui`'s README shows, and `AppShell` with a home page;
- a sample API: `openapi.json` is basis's example document, `src/api/generated/` its client, and `src/sample/` and
  `fixtures/sample-*.json` its pages and responses, so `vp dev` shows working pages in fixture mode before the app has
  an API. The app's `AGENTS.md` says how to replace it: `vp run client-pull PATH TAG` or `vp run client-pull URL`, then
  delete `src/sample/`, its routes and its fixtures;
- tests written with `@basis/ui/testing`, and a `.gitignore` that keeps fixture records and screenshots out of git;
- the framework's files, which `vp run sync` writes from the installed `@basis/ui` and `vp run check-full` holds to it:
  the agent files with basis-ui's block of `AGENTS.md` and the skill for driving the app, Vite+'s commit and push hooks,
  an Azure pipeline, never run yet, and a Dockerfile whose Caddy image serves the build with its precompressed files,
  the hashed assets cached as immutable and every other path `no-cache`.

The template's framework files are written by `vp run sync` itself (`node ../../../ui/src/preset/tasks.ts sync` in
`templates/app`), and `@basis/ui`'s tests fail when they differ from what it writes.
