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
- the framework's files, which `vp run sync` writes from the installed `@basis/ui` and `vp run verify` holds to it:
  the agent files with basis-ui's block of `AGENTS.md` and the skills, Vite+'s commit and push hooks, `.gitattributes`
  and `.gitignore`;
- a `Dockerfile`, `Caddyfile` and `.dockerignore`, the app's own from the start, whose Caddy image serves the build with
  its precompressed files, the hashed assets cached as immutable and every other path `no-cache`. The app changes them
  as its registry and cluster need, and writes its own pipeline.

The template's framework files are written by `vp run sync` itself (`node ../../../ui/src/preset/tasks.ts sync` in
`templates/app`), and `@basis/ui`'s tests fail when they differ from what it writes. A packed package drops its
`.gitignore`, so the template holds it as `_gitignore`, which `vp create` renames: after a sync in `templates/app`,
move the `.gitignore` it writes over `_gitignore`.

`vp run @basis/create#prove` proves the template: it packs the three packages, makes an app from the packed template in
a temporary folder outside the workspace, installs it from the tarballs, commits it through its hook, and runs
`vp run verify`, `vp run shot --all` and `vp build` in it. CI runs it when the template or either package changes;
[`@basis/ui`'s CONTRIBUTING.md](../ui/CONTRIBUTING.md#the-template-proven) says how to run it here.
