// @vitest-environment happy-dom
/* BasisApp's reports in a Node DOM: a telemetry that throws never stops the shell's answer to a failure, and the
 * page's own uncaught errors, in an event handler or a promise nobody awaited, reach telemetry. The rest of BasisApp is
 * tested in a browser, in packages/example. */

import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryHistory, createRootRoute, createRouter } from "@tanstack/react-router";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { anonymousSignIn, BasisApp, createQueryClient } from "#index.ts";
import type { Telemetry } from "#index.ts";
import { onErrorToast } from "#shell/toast-error.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A telemetry that keeps each error's source, and throws from every call when `throws` says so. */
function telemetryOf(throws: boolean): {
  readonly sources: unknown[];
  readonly telemetry: Telemetry;
} {
  const sources: unknown[] = [];
  const fail = (): void => {
    if (throws) {
      throw new Error("The collector is down.");
    }
  };
  const telemetry: Telemetry = {
    error: (_error, attributes = {}) => {
      sources.push(attributes["source"]);
      fail();
    },
    event: fail,
    timing: fail,
  };
  return { sources, telemetry };
}

async function renderShell(telemetry: Telemetry): Promise<ReturnType<typeof createQueryClient>> {
  const queryClient = createQueryClient();
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: createRootRoute({ component: () => <p>Home</p> }),
  });
  render(
    <BasisApp
      queryClient={queryClient}
      router={router}
      signIn={anonymousSignIn()}
      telemetry={telemetry}
    />,
  );
  await screen.findByText("Home");
  return queryClient;
}

/** The first argument of each `console.error` from now on. */
function consoleErrors(): unknown[] {
  const logged: unknown[] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args[0]);
  });
  return logged;
}

test("a telemetry that throws never stops a failed mutation's toast", async () => {
  const logged = consoleErrors();
  const queryClient = await renderShell(telemetryOf(true).telemetry);
  const toasts: unknown[] = [];
  const stop = onErrorToast((raised) => {
    toasts.push(raised);
  });
  const saving = queryClient.getMutationCache().build(queryClient, {
    mutationFn: async (_variables: string) => Promise.reject(new Error("The save failed.")),
  });
  await expect(saving.execute("p1")).rejects.toThrow("The save failed.");
  stop();
  expect(toasts).toHaveLength(1);
  expect(logged).toContain("[telemetry] the collector threw");
});

test("the page's uncaught errors and unhandled rejections reach telemetry", async () => {
  const { sources, telemetry } = telemetryOf(false);
  await renderShell(telemetry);
  globalThis.dispatchEvent(new ErrorEvent("error", { error: new Error("A click handler broke.") }));
  const rejection = Object.assign(new Event("unhandledrejection"), {
    reason: new Error("Nobody awaited this."),
  });
  globalThis.dispatchEvent(rejection);
  expect(sources).toEqual(["page", "unhandled-rejection"]);
});
