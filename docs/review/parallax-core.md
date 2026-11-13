# Review: parallax's TypeScript core

No release blocker in the strict sense, but 1–7 should be fixed before tens of developers build on this. All paths are under `packages/parallax/`. Nothing in the repo was touched; the scratch scripts are in `(a scratch folder)` (`check1.ts`, `check2.ts`, `check3.mjs`, `check4.ts`, `check5.ts`). "Real engine" below means the `wasm/` build of 11 Nov driven from Node behind the page's `Connection`.

## Findings

1. **`packages/parallax/src/react/use-view.ts:68-81` (and `:91-97`) — a view the engine refuses to open never opens, even after the layout is corrected.**
   - `useOpen`'s effect does not depend on the layout, so the corrected layout goes as `updateView` to a view the engine never opened. The engine answers every later request for that id with the original refusal (`crates/parallax-session/src/lib.rs:747, 951-960`).
   - Scenario: a saved or URL layout names a column the API dropped; the grid shows "column X is not in the table"; the user or app resets the layout; the same error stays until the component remounts.
   - A Zod-invalid layout does recover, because `ready` toggles; an engine-refused one does not.
   - Severity: fix before release. Confidence: confirmed by running on the real engine (`check5.ts`, case A: corrected layout, same error, 0 frames).
   - Done in Parallax: a refused view opens once its layout is corrected, and tells the app: the view's attempt remembers the layout it opened with, and a view the engine refused to open
     (it failed before any `opened` came) opens again, as a new view, when its layout changes, rather than updating a
     view the engine never opened. Held by `tests/browser/refused-views.test.tsx`, and by
     `tests/browser/grid-states.test.tsx` through `Grid`, which also gained `onError` (`grid-pivot.md` 7).

2. **`packages/parallax/src/engine/browser-engine.ts:265-269` with `packages/parallax/src/react/use-dataset.ts:76-91` — a planned restart fails any dataset whose fetch is still on its way.**
   - `#answers.idle` does not count a `load()` whose bytes are a pending promise, which is every documented source until its headers arrive. `restarted()` then treats "load under way" as the load that ran the engine out of memory, planned or not.
   - Scenario: under the showcase's shared `DataLayout`, wasm memory has passed 1 GiB (I did not measure this; my guess is a 1M-row table reloaded once gets near it). The user goes from page A to B; A's unload answers in milliseconds and the worker is replaced while B waits for its first byte.
   - B shows `failed` with "…its data loads again", which is false: it stays failed until `reload()`. Its table still loads into the new worker unseen.
   - Severity: fix before release. Confidence: engine half confirmed by running (`check1.ts` e); hook half by reading.
   - Done in Parallax: a load under way survives a planned restart, and an unload, a read body or a failed post ends it: the engine counts every load from its call until it settles, a fetch still on its way among them,
     so a planned restart waits for it; a fetch that arrives after its worker was replaced fails with the reason and
     never reaches the new worker. `Restart` gains `planned`, and a planned restart stops no dataset, which loads
     again on the new engine; that covers a load answered just before the restart, which the hook had not yet heard.
     Held by `tests/unit/engine-arrivals.test.ts` and `tests/browser/restarts.test.tsx`.

3. **`packages/parallax/src/engine/view.ts:254-263` with `updates.ts:89-102, 135-137` — after a refused layout update, the view drops every later frame as stale.**
   - `begin()` raises the client's config version before the engine accepts; on refusal the engine keeps the old one (`lib.rs:752-806` returns before line 806), and `refused()` does not roll back.
   - Scenario: a pivot edit the engine refuses. The README names one: a `titles` key that names neither a column nor a measure. The error banner shows, and then scrolling, pushed reload frames and chart zooms all draw nothing until some later update is accepted.
   - Severity: fix before release. Confidence: confirmed by running on the real engine (`check5.ts`, case B: 0 of 3 scroll frames drawn; a copy fetch still answers).
   - Done in Parallax: a refused view opens once its layout is corrected, and tells the app: `LayoutUpdates` keeps the newest version the engine took and the versions sent and not yet
     answered; a refusal forgets its version, so the stale floor falls back to the layout the engine kept. Held by
     `tests/unit/updates.test.ts` ("an update the engine refuses") and `tests/browser/refused-views.test.tsx`.

4. **`packages/parallax/src/react/dataset-share.ts:106-128` with `browser-engine.ts:127-133` — a dataset whose last holder unmounts mid-fetch is loaded anyway and never unloaded.**
   - The unload reaches the worker before the load does, so it drops nothing; the bytes then arrive and the table loads with no holder.
   - Scenario: the user clicks away from a page before its API answers. Up to about 450 MB of wasm per occurrence stays until that name is next loaded and unloaded, or the engine traps.
   - Severity: fix before release. Confidence: confirmed by running (`check1.ts` f: worker receives `unload` then `load`; page still holds it).
   - Done in Parallax: a load under way survives a planned restart, and an unload, a read body or a failed post ends it: an unload drops the dataset's loads not yet answered; one whose bytes arrive afterwards fails,
     cancelling a response's body unread, and one already in the worker is not counted as held when it is answered.
     Held by `tests/unit/engine-arrivals.test.ts`. Cancelling the fetch itself is finding 10.

5. **`packages/parallax/src/react/dataset-share.ts:86-99` — a dataset name is a provider-wide key, and a second source under the same name silently replaces the table.**
   - Scenario: two cards call `useDataset("positions", …)` with different fund filters. Both report `loaded`, each with its own `rows`, and both views show whichever load finished last.
   - On a route change inside one provider, the new page's load becomes a reload of the old page's table: old rows stay visible until it applies, and the old primary key is kept.
   - The show-data skill's example uses the fixed name `"positions"` and no doc mentions parameters in names. A wrong number under the wrong heading is what the package promises not to show.
   - Severity: fix before release (at least an error when two live holders disagree). Confidence: confirmed by reading.

6. **`packages/parallax/src/theme/page.ts:77` — `ParallaxProvider` cannot mount in the preset's Node DOM.**
   - `document.fonts` is undefined in happy-dom 21, so the page watcher's `subscribe` throws. `Worker` is undefined there too, so `prewarm` throws next.
   - Scenario: `BASIS_TEST_DOM=node vp test`, the route check the design gives citizen developers. Any route under the provider fails with "Cannot read properties of undefined (reading 'addEventListener')". The showcase's parallax routes were only ever checked in Chromium.
   - Severity: fix before release for that audience. Confidence: confirmed by running the watcher under happy-dom (`check4.ts`); route-level outcome by reading.

7. **`packages/parallax/src/engine/stream.ts:104-105` with `browser-engine.ts:213` — a `Response` whose body is already locked hangs the load and every load behind it.**
   - `getReader()` throws outside the try, the rejection is swallowed, and no `load-end` is posted. The worker waits for bytes forever, and its queue is serial, so later loads and unloads never run.
   - Scenario: a source that returns a memoized `Response`. In production it hangs on `reload()` or any restart recovery; under StrictMode it hangs on the first mount. Status stays `loading` with no error.
   - Severity: fix before release (small fix). Confidence: confirmed by running (`check1.ts` b, `check2.ts` h).
   - Done in Parallax: a load under way survives a planned restart, and an unload, a read body or a failed post ends it: a response whose body was used or is locked is refused before the load is sent, saying to return a
     new response from each call, and a `getReader` that throws still tells the worker to give the load up. Held by
     `tests/unit/engine-arrivals.test.ts`.

8. **`packages/parallax/src/react/dataset-share.ts:36-46` — the shared-load key includes each hook's private `engine` and `reloads` counters.**
   - Two components asking for the same data stop sharing once they have heard different numbers of restarts or reloads.
   - Scenario: a card mounted before a planned restart and a drawer opened after it fetch and load the same table twice. After every later restart, both reload it at once. One hook's `reload()` leaves the other's `rows` and `failed` state stale.
   - Severity: fix before release. Confidence: confirmed by running (`check1.ts` d: two runs).

9. **`packages/parallax/src/engine/client.ts:160-171` — the give-up rule is a 60 s window, so it never fires when a load-trap cycle takes 30 s or more.**
   - Scenario: a pivot layout that runs a loaded 1M-row table out of memory, against an API that takes over 30 s to serve it. Recovery reloads the table, the view reopens with the same layout, and it traps again, indefinitely, refetching up to 500 MB each time.
   - Severity: fix before release. Confidence: counting confirmed by running (`check2.ts` g: a trap every 31 s always recovers); the timing is plausible, not measured.
   - Done in Parallax: a load under way survives a planned restart, and an unload, a read body or a failed post ends it: the client counts a run of restarts, each within the window of the one before, and the window is
     five minutes, so a load that traps the engine each time it has loaded again is given up on after the third,
     however long the table takes to arrive, up to five minutes a cycle. The README says so. Held by
     `tests/unit/client.test.ts`.

10. **`packages/parallax/src/react/dataset-load.ts:93-115` with `engine/worker-loads.ts:119-132` — nothing cancels a load.**
    - `source` gets no `AbortSignal`, and a superseded or unmounted load downloads and parses to the end.
    - Scenario: five quick changes of a date parameter queue five full loads; the grid steps through each. A stalled body blocks every dataset's load and unload behind it.
    - Severity: fix before release (cancel superseded readers; pass `{ signal }`). Confidence: confirmed by reading.

11. **`packages/parallax/src/react/dataset-load.ts:80` — bytes the app holds are `structuredClone`d before the byte limit is checked.**
    - A 1.5 GB buffer is copied on the main thread and then refused.
    - Severity: polish. Confidence: confirmed by reading.

12. **`packages/parallax/src/engine/answers.ts:24-31` — a `postMessage` that throws leaves its request waiting forever.**
    - Scenario: a function source returns the same `ArrayBuffer` twice; the second is detached. `idle` is never true again, so planned restarts stop, and the progress listener leaks.
    - Severity: polish. Confidence: confirmed by running (`check1.ts` c).
    - Done in Parallax: a load under way survives a planned restart, and an unload, a read body or a failed post ends it: a request whose post throws is no longer waited for, and its progress listener is dropped; bytes
      that already moved to the engine are refused before the post, saying to return new bytes from each call. Held
      by `tests/unit/engine-arrivals.test.ts`.

13. **`packages/parallax/src/index.ts:7, 51-58` — the public surface exposes ways to break the hooks.**
    - `useParallaxClient()` hands apps `close()`, `unload()` and `load()`. None of them tells the hooks, so after `close()` datasets read `loaded` on an empty engine and views stay failed.
    - `ViewHandle`'s `receive*` methods are in the published types (`dist/styles-*.d.mts:1259`).
    - `Unloaded` and `Connection`, which public methods return, are not exported from the main entry.
    - No app in the repo uses any of this. `./internals` itself is fine as labelled.
    - Severity: polish, but cheap only before release. Confidence: confirmed by reading.

14. **`packages/parallax/src/engine/stream.ts:16-21` — a cross-origin response hides `Content-Encoding`.**
    - A gzipped body's `Content-Length` is read as plain, so `expectedRows` and the status bar's "rows to come" are low by the compression ratio. The byte cap still holds as it streams.
    - Severity: polish. Confidence: plausible, by reading.

15. **`packages/parallax/src/format.ts:20-39, 77-79` — exact conversions fail at their edges.**
    - `exactDecimal(5n, -2)` gives `"5"`; a timestamp of i64 max throws `RangeError`; dates past year 9999 give `"+010183-09"`.
    - I did not check whether the engine can send a negative scale.
    - Severity: polish. Confidence: confirmed by running (`check2.ts` i).

## Overall quality

The engine, client and worker protocol are sound: every request is matched by id and the engine answers each one. Coalescing is confined to viewports, chart windows and layout updates, and traps fail everything and restart cleanly without leaking the old worker. The weak layer is the React bookkeeping above it: what identifies a dataset, what "a load under way" means, and what a view does when the engine says no.

The tests are real and specific, including a real worker run out of memory, but they cover single components on the happy path. None covers an engine-refused layout, a fetch in flight at unmount or restart, components that mount at different times, or the Node DOM. The StrictMode test only asserts that data appears. The "built worker" test starts `dist/worker.mjs` itself rather than through `packagedWorker()`, so that path rests on the demo's end-to-end run.

Layout parsing, theme following and import safety are in good shape. Old versions migrate, unknown fields and bad types fail with a readable reason, and the built package imports cleanly in bare Node.

## Content-Security-Policy

Nothing documents this, and none of it was run in a browser; it is from reading the build and the specs.

- **`script-src 'self' 'wasm-unsafe-eval'`**: needed to compile the wasm. Send it on the response that serves the worker script too, since Chromium may apply the worker's own policy.
- **`worker-src 'self'`**: the worker is a same-origin module script, never a `blob:`; it must be same-origin with the page.
- **`connect-src`**: `'self'` for the worker's fetch of the `.wasm`, plus the API's origin for Arrow.
- **`style-src 'unsafe-inline'`** (or hashes): the provider injects `<style id="px-theme-…">` and has no nonce hook. Blocked, the canvases fall back to parallax's own default colours rather than the app's theme.
- **No `'unsafe-eval'`**: Zod probes `new Function` once, which a strict policy reports but survives.
- **Trusted Types**: `require-trusted-types-for 'script'` would block `new Worker(url)` without a default policy.
- **Not needed**: COOP/COEP, except for the overlay's whole-tab memory figure.

## Not reached

- `src/proto/parallax_pb.ts` (generated) and `src/frame/chart-data.ts` (types).
- README lines 330-380, and `packages/parallax/docs/design.md` beyond a search.
- Tests read by name only: `browser-engine.test.ts`, `engine-loads.test.ts`, the theme, page-watch, maximize and progressive tests, and the e2e suites.

## Changelog

- A view the engine refused to open, such as one whose saved layout names a column the API dropped, opens once its
  layout is corrected, and a view that refused a change draws again on the layout the engine kept. What to do:
  nothing.

- `Grid`, `Pivot` and `Chart` take `onError`, called with the reason they show in place of their data, or for a
  change the engine refused, each time it changes, and with null once it clears. What to do: nothing; a page that
  restores a saved layout may reset it there.

- A dataset whose fetch is on its way when the engine gives its memory back, in a planned restart, loads on the new
  engine rather than failing; `Restart`, which `ParallaxClient.onRestart` hears, gains `planned`. What to do: nothing.

- A dataset whose last component unmounts while its fetch is on its way is not loaded when the bytes arrive. What to
  do: nothing.

- A source that hands back a response whose body was already read, or bytes that already moved to the engine, fails
  its load with a reason that says to return new ones from each call, where it waited for ever. What to do: a source
  that keeps one `Response` or `ArrayBuffer` returns a new one from each call.

- Parallax gives up recovering from an engine that keeps running out of memory after the third restart in a run, each
  within five minutes of the one before, where it was three within a minute, so a large table that traps the engine
  each time it loads again stops being fetched. What to do: nothing.
