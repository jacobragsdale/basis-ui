/* `@basis/ui/testing`: what an app's tests are written with, so one test runs both in Chromium and in a Node DOM, on a
 * laptop with no browser (docs/design.md, Consumers). It is Testing Library's API, `renderApp` for the app at an
 * address, `mockApi` for the API, and `workbookFile` for an Excel workbook an import reads. A test that needs a real browser, for layout, focus or pixels, is named
 * `*.browser.test.tsx` and may use Vitest's browser API instead; the preset's lint keeps that API out of every other
 * test, and `basisTest({ browser: false })` runs every test but those. */

import { cleanup, render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { AnyRoute } from "@tanstack/react-router";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import type { RequestHandler } from "msw";
import type { setupServer as nodeServer } from "msw/node";
import { createElement } from "react";
import { afterEach } from "vite-plus/test";

import { BasisApp } from "#shell/basis-app.tsx";
import type { SignIn } from "#shell/sign-in.ts";
import { anonymousSignIn } from "#shell/sign-in.ts";
import type { Telemetry } from "#shell/telemetry.ts";

// Testing Library unmounts what a test rendered after it, as Vitest runs without globals.
afterEach(() => {
  cleanup();
});

/** What BasisApp reported while a test ran. */
interface AppReports {
  readonly errors: { readonly error: unknown; readonly source: unknown }[];
  readonly events: string[];
  readonly timings: string[];
}

/** A telemetry that keeps what it is told, so a test can read it. */
function recordingTelemetry(): { readonly reports: AppReports; readonly telemetry: Telemetry } {
  const reports: AppReports = { errors: [], events: [], timings: [] };
  const telemetry: Telemetry = {
    error: (error, attributes = {}) => {
      reports.errors.push({ error, source: attributes["source"] });
    },
    event: (name) => {
      reports.events.push(name);
    },
    timing: (name) => {
      reports.timings.push(name);
    },
  };
  return { reports, telemetry };
}

interface RenderAppOptions {
  /** The sign-in adapter: `anonymousSignIn()` unless set, or `fakeSignIn()` for a signed-in user. */
  readonly signIn?: SignIn;
}

interface RenderedApp extends RenderResult {
  readonly reports: AppReports;
}

/** The app's routes at `path`, in BasisApp, on a memory history, as a user signed in with `signIn` sees them. Find
 * what it shows with `screen`, and wait for data with `await screen.findByText(...)`. */
function renderApp(
  routeTree: AnyRoute,
  path: string,
  { signIn = anonymousSignIn() }: RenderAppOptions = {},
): RenderedApp {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree,
  });
  const { reports, telemetry } = recordingTelemetry();
  const rendered = render(createElement(BasisApp, { router, signIn, telemetry }));
  return { ...rendered, reports };
}

/** The API, as MSW answers it for a test: `use` adds a test's own handlers, `reset` drops them, `close` stops it. */
interface MockApi {
  readonly use: (...handlers: RequestHandler[]) => void;
  readonly reset: () => void;
  readonly close: () => Promise<void>;
}

/** What `msw/node` exports that `nodeMocks` uses. */
interface NodeModule {
  readonly setupServer: typeof nodeServer;
}

function isNodeModule(loaded: unknown): loaded is NodeModule {
  return typeof loaded === "object" && loaded !== null && "setupServer" in loaded;
}

/** MSW's Node server, which answers in a Node DOM. Its module name is held in a variable so that a browser run, which
 * never calls this, does not try to bundle a module made for Node. */
async function nodeMocks(handlers: readonly RequestHandler[]): Promise<MockApi> {
  const nodeModule = "msw/node";
  // oxlint-disable-next-line eslint/no-inline-comments -- Vite reads @vite-ignore only inside the import(); it keeps a browser run from trying to bundle a module made for Node.
  const loaded: unknown = await import(/* @vite-ignore */ nodeModule);
  if (!isNodeModule(loaded)) {
    throw new Error(
      "ERROR msw/node did not load: install msw, which @basis/ui depends on, and run vp install.",
    );
  }
  const server = loaded.setupServer(...handlers);
  server.listen({ onUnhandledFrame: "bypass" });
  return {
    close: async () => {
      server.close();
      await Promise.resolve();
    },
    reset: () => {
      server.resetHandlers();
    },
    use: (...more) => {
      server.use(...more);
    },
  };
}

/** MSW's service worker, which answers in Chromium. */
async function browserMocks(handlers: readonly RequestHandler[]): Promise<MockApi> {
  const { setupWorker } = await import("msw/browser");
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledFrame: "bypass", quiet: true });
  return {
    close: async () => {
      await worker.stop();
    },
    reset: () => {
      worker.resetHandlers();
    },
    use: (...more) => {
      worker.use(...more);
    },
  };
}

/** The API, answered by `handlers` (such as the generated client's mocks) in whichever run the test is in: MSW's
 * service worker in Chromium, its Node server in a Node DOM. Start it once per file, `reset` it after each test. */
async function mockApi(...handlers: RequestHandler[]): Promise<MockApi> {
  return "serviceWorker" in navigator ? browserMocks(handlers) : nodeMocks(handlers);
}

export { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
export { mockApi, renderApp };
export { workbookFile, type WorkbookCell, type WorkbookFileOptions } from "./workbook-file.ts";
export type { AppReports, MockApi, RenderAppOptions, RenderedApp };
