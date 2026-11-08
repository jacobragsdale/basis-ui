# @basis/create

The template a UI repo is made from, for an app on `@basis/ui` and `@basis/parallax`:

```sh
vp create @basis:app --directory positions-ui
```

`vp create` reads it from the registry the repo's `.npmrc` names for the `@basis` scope. The app it makes is
`templates/app`: the preset's configuration with exactly the lines `@basis/ui`'s README shows, `AppShell` with one page,
a test written with `@basis/ui/testing`, the agent files and the skill for driving the app, Vite+'s hooks, a
`.gitignore` that keeps fixture records and screenshots out of git, an Azure pipeline, and a Dockerfile whose image
serves the build with its precompressed files.
