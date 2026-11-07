/* What the example's tests share: MSW's service worker standing in for the API, and the app rendered at an address in
 * BasisApp, on a memory history, signed in with the fake adapter and reporting to a telemetry the test can read. */

import { BasisApp, fakeSignIn } from "@basis/ui";
import type { SignIn, Telemetry } from "@basis/ui";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { setupWorker } from "msw/browser";
import { afterEach } from "vite-plus/test";
import { render } from "vitest-browser-react";
import type { RenderResult } from "vitest-browser-react";

import { routeTree } from "./routes.ts";

import "./styles.css";

/** The API, as the tests' handlers answer it: each test adds its own with `worker.use(...)`. A request no handler
 * takes reaches the test server, which has no API, so it fails as the test would see it fail. */
const worker = setupWorker();
await worker.start({ onUnhandledFrame: "bypass", quiet: true });

afterEach(() => {
  worker.resetHandlers();
});

/** What BasisApp reported while a test ran. */
interface Reports {
  readonly errors: { readonly error: unknown; readonly source: unknown }[];
  readonly events: string[];
  readonly timings: string[];
}

/** A telemetry that keeps what it is told, so a test can read it. */
function recordingTelemetry(): { readonly reports: Reports; readonly telemetry: Telemetry } {
  const reports: Reports = { errors: [], events: [], timings: [] };
  return {
    reports,
    telemetry: {
      error: (error, attributes = {}) => {
        reports.errors.push({ error, source: attributes["source"] });
      },
      event: (name) => {
        reports.events.push(name);
      },
      timing: (name) => {
        reports.timings.push(name);
      },
    },
  };
}

interface RenderedApp {
  readonly screen: RenderResult;
  readonly reports: Reports;
}

/** The app at `path`, as a user signed in with `signIn` sees it: `fakeSignIn()`'s user by default. */
async function renderApp(path: string, signIn: SignIn = fakeSignIn()): Promise<RenderedApp> {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree,
  });
  const { reports, telemetry } = recordingTelemetry();
  const screen = await render(<BasisApp router={router} signIn={signIn} telemetry={telemetry} />);
  return { reports, screen };
}

export { renderApp, worker };
export type { Reports };
