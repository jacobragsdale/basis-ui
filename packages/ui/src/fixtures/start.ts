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

/** Why fixture mode cannot start on this page, or `undefined` when it can: the browser gives a service worker only to a
 * secure page, one served over HTTPS or from `localhost`, so a page opened over plain HTTP by hostname has none. */
function noServiceWorker(): string | undefined {
  if ("serviceWorker" in navigator) {
    return undefined;
  }
  const local = location.port === "" ? "http://localhost" : `http://localhost:${location.port}`;
  return `Fixture mode answers /api with a service worker, which the browser gives only a secure page, and ${location.protocol}//${location.host} is not one: open ${local}, or serve the app over HTTPS.`;
}

/** Says on the page, as text, and in the console, that fixture mode could not start, so the page is not left blank:
 * the page's inline script calls it, and imports none of the app's modules, which would ask a real API. */
function fixtureModeFailed(error: unknown): void {
  // oxlint-disable-next-line eslint/no-console -- the page cannot run, and the console is where a developer looks.
  console.error("[fixture mode] could not start", error);
  const heading = document.createElement("h1");
  heading.textContent = "Fixture mode could not start";
  const reason = document.createElement("p");
  reason.textContent = error instanceof Error ? error.message : String(error);
  const notice = document.createElement("main");
  notice.style.cssText = "font: 16px/1.5 system-ui, sans-serif; margin: 2rem; max-width: 40rem";
  notice.append(heading, reason);
  document.body.replaceChildren(notice);
}

/** Starts MSW's service worker with fixture mode's handler, and reports what it answers from. It fails, saying what
 * to open instead, on a page that has no service worker. */
async function startFixtureMode({
  records,
  fixtures,
  generated,
  telemetry = consoleTelemetry,
  base = "/",
}: FixtureModeOptions): Promise<void> {
  const refused = noServiceWorker();
  if (refused !== undefined) {
    throw new Error(refused);
  }
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

export { fixtureModeFailed, startFixtureMode };
export type { FixtureModeOptions };
