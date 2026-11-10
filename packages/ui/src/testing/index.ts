/* `@basis/ui/testing`: what an app's tests are written with, so one test runs both in Chromium and in a Node DOM, on a
 * laptop with no browser (docs/design.md, Consumers). It is Testing Library's API, `renderApp` for the app at an
 * address, `mockApi` for the API, `workbookFile` for an Excel workbook an import reads, `checkRoutes` for every route
 * on the app's fixtures at once, and `expectAccessible` for axe's check of what a test rendered. A test that needs a real browser, for layout, focus or pixels, is named
 * `*.browser.test.tsx` and may use Vitest's browser API instead; the preset's lint keeps that API out of every other
 * test, and `basisTest({ browser: false })` runs every test but those. */

import { cleanup, render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { AnyRoute } from "@tanstack/react-router";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
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

export { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
export { checkRoutes, type CheckRoutesOptions } from "./check-routes.ts";
export { expectAccessible } from "./axe.ts";
export { mockApi, type MockApi } from "./mock-api.ts";
export type { RouteParams } from "./route-samples.ts";
export { renderApp };
export { workbookFile, type WorkbookCell, type WorkbookFileOptions } from "./workbook-file.ts";
export type { AppReports, RenderAppOptions, RenderedApp };
