---
metadata:
  basis-ui: "managed by basis-ui: `vp run sync` rewrites it"
name: verify-the-app
description: Check that this app is right before saying a change is done: run every check in one command, read its ERROR lines, and fix each. Use after any change to the app, before committing, and when a commit or push hook fails.
---

# Verifying the app

```sh
vp run verify                          # every stage, then one summary
vp run verify --stage lint --stage types   # only the stages that failed
vp run verify --json                   # {ok, stages: [{name, ok, ms, errors: [{file, line, rule, message, fix}]}]}
```

The stages run in order, each to its end: `sync` (the framework's files), `client` (the generated client against
`openapi.json`), `fixtures`, `config`, `lint`, `types`, `tests`, `build`, `budget` (each route's kilobytes) and
`suppressions`. The commit hook runs the fast ones; the push hook runs them all.

Every failure is one line that starts with `ERROR`, names the file and line, gives the reason and ends with its fix.
Do what the line says, then run the stages that failed again. Do not:

- turn a check off with a comment: `basis/no-suppressions` refuses it, and the stage counts them;
- restyle a component through `className`, or declare a colour or class in `src/styles.css`: the line names the
  variant, size or token to use, and `vp run docs NAME` shows them;
- raise a route's budget to pass `budget` without asking whether the page needs all it loads: a lazy import is the
  first fix.

Then look at what changed: `vp run shot /ROUTE` writes the picture, the accessibility tree, the console, the network
and axe's report to `.shots/` (the `drive-the-app` skill). A change is done when `vp run verify` passes and the shot
shows the page as asked.
