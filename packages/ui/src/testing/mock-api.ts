/* `mockApi`: the API, as MSW answers it in a test, by its service worker in Chromium and its Node server in a Node
 * DOM, so one test runs in either. */

import type { RequestHandler } from "msw";
import type { setupServer as nodeServer } from "msw/node";

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

export { mockApi };
export type { MockApi };
