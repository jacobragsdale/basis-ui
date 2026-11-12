---
metadata:
  basis-ui: "managed by basis-ui: `vp run sync` rewrites it"
name: drive-the-app
description: See and drive this app's pages in a browser. Use after changing anything an app shows, before saying a page works, and when a page misbehaves in a way tests do not explain: take a shot of a route, or open it with Playwright CLI to click, type and read its console.
---

# Driving the app

A UI change is not done until you have looked at it. The app runs without a backend: `vp dev` serves it in fixture
mode on a port of its own, answering `/api` from `.fixtures/`, `fixtures/` and orval's mocks.

## One look at a route: `vp run shot`

```sh
vp run shot /positions                                  # light, compact, 1280 by 800
vp run shot /positions --mode dark --density comfortable
vp run shot /trades/42 --width 390 --wait 2000
vp run shot /positions --selector '#exposure'           # one element, by its CSS selector
vp run shot --all                                       # every route of the router
vp run shot /bonds/US91282CRF04 --all --json            # with a page for /bonds/$security, as one line of JSON
```

`--theme` takes `default`, `desk` or `high-contrast`, as `vp run shot /positions --theme desk`. The theme, mode and
density are set through the preferences cookie, as the user menu sets them.

It uses the `vp dev` already running, or starts one in fixture mode and stops it after, and writes five files to
`.shots/` for each route, named after it, with `-dark`, `-comfortable` and `--SELECTOR` added when asked for:

- `positions.png`: the page. Read it, as an image.
- `positions.aria.yml`: the accessibility tree: roles, names and text. Check headings, labels and that the data is
  there.
- `positions.console.txt`: every console error and uncaught exception.
- `positions.network.txt`: each request to `/api`, its status, and what answered it: `record` (`.fixtures/`),
  `fixture` (`fixtures/`, with the file), `generated` (orval's mocks), `none` (nothing did: add a fixture) or `live`.
  A page that shows the wrong data, or none, starts here.

  ```text
  GET /api/bonds/US91282CRF04 200 fixture fixtures/bond-US91282CRF04.json
  ```

- `positions.axe.txt`: axe's accessibility check, WCAG 2.2 A and AA and best practices, one `ERROR` line for each
  element at fault, with the rule and the fix.

The task fails on a console error, an axe violation, a step it cannot take or a picture that differs from its
baseline, each an `ERROR` line that ends in its fix, with the files still written. `--all` skips a route with a
parameter unless a route you name is one of its pages. `--json` prints `{ok, shots, skipped, problems}` on one line.

### Clicking before the picture: `--step`

```sh
vp run shot /settlements/new --step 'type:Amount=1,000,000' --step 'click:Save' --step 'wait:Saved'
vp run shot /positions --step 'click:Book' --step 'click:Rates' --step 'press:Escape'
```

| Step               | Does                                                        |
| ------------------ | ----------------------------------------------------------- |
| `click:TARGET`     | clicks it                                                   |
| `hover:TARGET`     | moves the pointer over it                                   |
| `type:TARGET=TEXT` | fills it with TEXT; nothing after `=` clears it             |
| `press:KEY`        | presses a key or chord, as `Enter`, `Escape` or `Control+k` |
| `wait:MS`          | waits that many milliseconds                                |
| `wait:TARGET`      | waits until it shows                                        |

A TARGET is a control's exact name, label or placeholder, as the `.aria.yml` shows it, or an element's exact text; or a
CSS selector when it starts with `#`, `.` or `[`, or after `css=`, as `css=main button`. It must pick one element that
shows. Steps act on one route, so give them with one route and no `--all`.

### Comparing with a baseline: `--compare`

```sh
vp run shot --all --compare baselines   # each .shots/NAME.png against baselines/NAME.png
```

A picture that differs fails, giving the count of changed pixels and `.shots/NAME.diff.png`, the changes in red. Copy
a picture into the folder to make it the baseline. Pictures differ from one operating system to the next, so make and
compare baselines in WSL.

Take one shot of each page you changed, in both modes when you changed colours. `.shots/` is not committed.

## Clicking through: Playwright CLI

For more than `--step` does, such as reading the page between actions or following a link and looking around, drive
the page with Playwright CLI in a session named after the app. Start `vp dev` first and use the URL it prints.

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
- No console errors, no axe violations, and every request to `/api` answered by what you meant.
- Every control has a name in the accessibility tree, and headings are in order.
- Both modes, when you changed colours or added a component.
