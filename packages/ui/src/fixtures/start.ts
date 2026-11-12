/* Starting fixture mode in the browser: MSW's service worker, answering every request under `/api` as handlers.ts
 * says. In `vp dev`, the preset's plugin (src/preset/fixture-mode.ts) calls `startFixtureMode` from the page before
 * the app's entry module runs, with the fixtures it read from disk and the app's generated MSW module, so an app writes
 * no code for it. */

import { setupWorker } from "msw/browser";

import { consoleTelemetry } from "#shell/telemetry.ts";
import type { Telemetry } from "#shell/telemetry.ts";

import { generatedHandlers } from "./generated.ts";
import { fixtureHandlers, servedBodyFiles } from "./handlers.ts";
import type { LoadedFixture } from "./record.ts";

interface FixtureModeOptions {
  /** The records exported into `.fixtures/`, in the order to try them. */
  readonly records: readonly LoadedFixture[];
  /** The synthetic responses in `fixtures/`, in the order to try them. */
  readonly fixtures: readonly LoadedFixture[];
  /** The app's generated MSW module, `src/api/generated/client.msw.ts`, as `import * as` gives it. */
  readonly generated: Readonly<Record<string, unknown>>;
  /** Where each answer is reported; the console by default. */
  readonly telemetry?: Telemetry;
  /** The app's base, Vite's `base`, under which MSW's worker script and the body files are served: `/` by default. */
  readonly base?: string;
}

/** Starts MSW's service worker with fixture mode's handler, and reports what it answers from. */
async function startFixtureMode({
  records,
  fixtures,
  generated,
  telemetry = consoleTelemetry,
  base = "/",
}: FixtureModeOptions): Promise<void> {
  const handlers = generatedHandlers(generated);
  const bodyFiles = servedBodyFiles(base);
  const worker = setupWorker(
    ...fixtureHandlers({ bodyFiles, fixtures, generated: handlers, records, telemetry }),
  );
  await worker.start({
    onUnhandledFrame: "bypass",
    quiet: true,
    serviceWorker: { url: `${base}mockServiceWorker.js` },
  });
  telemetry.event("fixture-mode.started", {
    fixtures: fixtures.length,
    generated: handlers.length,
    records: records.length,
  });
}

export { startFixtureMode };
export type { FixtureModeOptions };
