---
name: drive-the-app
description: See and drive this app's pages in a browser. Use after changing anything an app shows, before saying a page works, and when a page misbehaves in a way tests do not explain: take a shot of a route, or open it with Playwright CLI to click, type and read its console.
---

# Driving the app

A UI change is not done until you have looked at it. The app runs without a backend: `vp dev` serves it in fixture
mode on a port of its own, answering `/api` from `.fixtures/`, `fixtures/` and orval's mocks.

## One look at a route: `vp run shot`

```sh
vp run shot /positions                       # light, compact, 1280 by 800
vp run shot /positions --dark --comfortable  # the other mode and density
vp run shot /trades/42 --width 390 --wait 2000
```

It uses the `vp dev` already running, or starts one in fixture mode and stops it after, and writes three files to
`.shots/`, named after the route:

- `positions.png`: the whole page. Read it, as an image.
- `positions.aria.yml`: the accessibility tree: roles, names and text. Check headings, labels and that the data is
  there.
- `positions.console.txt`: every console error and uncaught exception. The task fails when it is not empty: fix the
  errors before trusting the picture.

Take one shot of each page you changed, in both modes when you changed colours. `.shots/` is not committed.

## Clicking through: Playwright CLI

For anything more than one look, such as opening a menu, filling a form or following a link, drive the page with
Playwright CLI in a session named after the app. Start `vp dev` first and use the URL it prints.

```sh
vp dev &                                                     # prints http://localhost:PORT
vp dlx @playwright/cli@0.1.23 install-browser chrome-for-testing   # once per machine
pw() { vp dlx @playwright/cli@0.1.23 -s=app "$@"; }
pw open --browser=chromium http://localhost:PORT/positions
pw snapshot                     # the page's tree, each element with a ref such as f1e7
pw find "Record a settlement"   # search the tree instead of reading it all
pw click f1e7                   # act on a ref from the latest snapshot
pw fill f1e12 "1mm" --submit
pw console error                # errors since the page opened
pw screenshot                   # when you need to see it
pw close
```

- Take a new snapshot after every action that changes the page: refs belong to the snapshot they came from.
- Prefer `find` and `snapshot` to screenshots: they are text, and cheaper to read.
- `set-color-scheme dark` and `resize 390 844` show the other mode and a narrow screen.
- Files it writes go to `.playwright-cli/`; delete the folder when you are done.

## What to check

- The page draws what the fixtures hold, with nothing cut off or overlapping.
- No console errors.
- Every control has a name in the accessibility tree, and headings are in order.
- Both modes, when you changed colours or added a component.
