/* Starting fixture mode in the browser: MSW's service worker, answering every request under `/api` as handlers.ts
 * says. In `vp dev`, the preset's plugin (src/preset/fixture-mode.ts) calls `startFixtureMode` from the page before
 * the app's entry module runs, with the fixtures it read from disk and the app's generated MSW module, so an app writes
 * no code for it. */

import { setupWorker } from "msw/browser";
import type { RequestHandler } from "msw";

import { consoleTelemetry } from "#shell/telemetry.ts";
import type { Telemetry } from "#shell/telemetry.ts";

import { fixtureHandlers } from "./handlers.ts";
import type { LoadedFixture } from "./record.ts";

/** orval's handler for an operation, `get<Operation>MockHandler`, which answers with generated data when called with no
 * argument. Its siblings that end in a status, such as `getBondMockHandler404`, answer that status, and are left out. */
const generatedHandlerName = /^get\w+MockHandler$/u;

interface FixtureModeOptions {
  /** The records exported into `.fixtures/`, in the order to try them. */
  readonly records: readonly LoadedFixture[];
  /** The synthetic responses in `fixtures/`, in the order to try them. */
  readonly fixtures: readonly LoadedFixture[];
  /** The app's generated MSW module, `src/api/generated/client.msw.ts`, as `import * as` gives it. */
  readonly generated: Readonly<Record<string, unknown>>;
  /** Where each answer is reported; the console by default. */
  readonly telemetry?: Telemetry;
}

function isRequestHandler(value: unknown): value is RequestHandler {
  return (
    typeof value === "object" && value !== null && "run" in value && typeof value.run === "function"
  );
}

/** One handler for each operation in the app's generated MSW module, each answering with orval's generated data. */
function generatedHandlers(generated: Readonly<Record<string, unknown>>): RequestHandler[] {
  return Object.entries(generated)
    .filter(([name]) => generatedHandlerName.test(name))
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([, factory]) => {
      const handler: unknown =
        typeof factory === "function" ? Reflect.apply(factory, undefined, []) : undefined;
      return isRequestHandler(handler) ? [handler] : [];
    });
}

/** Starts MSW's service worker with fixture mode's handler, and reports what it answers from. */
async function startFixtureMode({
  records,
  fixtures,
  generated,
  telemetry = consoleTelemetry,
}: FixtureModeOptions): Promise<void> {
  const handlers = generatedHandlers(generated);
  const worker = setupWorker(
    ...fixtureHandlers({ fixtures, generated: handlers, records, telemetry }),
  );
  await worker.start({ onUnhandledFrame: "bypass", quiet: true });
  telemetry.event("fixture-mode.started", {
    fixtures: fixtures.length,
    generated: handlers.length,
    records: records.length,
  });
}

export { generatedHandlers, startFixtureMode };
export type { FixtureModeOptions };
