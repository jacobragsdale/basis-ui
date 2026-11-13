// @vitest-environment happy-dom
/* BasisApp's reports in a Node DOM: a telemetry that throws never stops the shell's answer to a failure, and the
 * page's own uncaught errors, in an event handler or a promise nobody awaited, reach telemetry. The rest of BasisApp is
 * tested in a browser, in packages/example. */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryHistory, createRootRoute, createRouter } from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  anonymousSignIn,
  apiFetch,
  arrowResponse,
  BasisApp,
  createQueryClient,
  fakeSignIn,
  fakeUser,
  sessionChangeEvent,
  useSession,
  useUser,
} from "#index.ts";
import type { SignIn, Telemetry, User } from "#index.ts";
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

/** Fails the test with what a click's promise rejected with. */
function report(error: unknown): void {
  throw error;
}

/** A router at `/` whose root shows `component`. */
function routerOf(component: () => ReactElement): AnyRouter {
  return createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: createRootRoute({ component }),
  });
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

/** A sign-in adapter written as a class, whose methods read `this`, as the firm's may be. */
class ClassSignIn implements SignIn {
  private readonly current = fakeUser;

  public async currentUser(): Promise<User | null> {
    return Promise.resolve(this.current);
  }

  public async token(): Promise<string | null> {
    return Promise.resolve(`token-for-${this.current.id}`);
  }

  public async signIn(): Promise<void> {
    await Promise.resolve(this.current);
  }

  public async signOut(): Promise<void> {
    await Promise.resolve(this.current);
  }
}

test("an adapter whose methods read this gives every request its token", async () => {
  const sent: Headers[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      sent.push(new Headers(init?.headers));
      return Promise.resolve(Response.json({}));
    }),
  );
  render(
    <BasisApp
      router={routerOf(() => (
        <p>Home</p>
      ))}
      signIn={new ClassSignIn()}
    />,
  );
  await screen.findByText("Home");
  await apiFetch("/positions");
  vi.unstubAllGlobals();
  expect(sent[0]?.get("authorization")).toBe("Bearer token-for-dev-user");
});

/** A page whose buttons sign the user out and in, and that names who is signed in, as `useUser` gives them. */
function SessionButtons(): ReactElement {
  const { signIn, signOut } = useSession();
  const user = useUser();
  return (
    <>
      <p>{user === null ? "nobody" : `${user.name}, ${user.roles.join(" ") || "no roles"}`}</p>
      <button
        onClick={() => {
          signOut().catch(report);
        }}
        type="button"
      >
        Sign out
      </button>
      <button
        onClick={() => {
          signIn().catch(report);
        }}
        type="button"
      >
        Sign in
      </button>
    </>
  );
}

/** The detail of each `basis:sessionchange` raised from now on, and the function that stops listening. */
function sessionChanges(): { readonly heard: unknown[]; readonly stop: () => void } {
  const heard: unknown[] = [];
  const listener = (event: Event): void => {
    heard.push(event instanceof CustomEvent ? event.detail : undefined);
  };
  globalThis.addEventListener(sessionChangeEvent, listener);
  return {
    heard,
    stop: () => {
      globalThis.removeEventListener(sessionChangeEvent, listener);
    },
  };
}

/** Clicks the button named `name`, then waits for `text`. */
async function clickThenFind(name: string, text: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name }));
  await screen.findByText(text);
}

test("basis:sessionchange is raised on window when the user becomes nobody or another, with their id", async () => {
  const { heard, stop } = sessionChanges();
  const signIn = fakeSignIn({ user: { ...fakeUser, roles: ["trader"] } });
  render(<BasisApp router={routerOf(SessionButtons)} signIn={signIn} />);
  await screen.findByText("Dev User, trader");
  expect(heard).toStrictEqual([]);
  await clickThenFind("Sign out", "nobody");
  await clickThenFind("Sign in", "Dev User, trader");
  stop();
  expect(heard).toStrictEqual([{ userId: null }, { userId: "dev-user" }]);
});

test("a dataset's invalid-token is answered as a query's: reported, and the ended session signed out", async () => {
  const { sources, telemetry } = telemetryOf(false);
  render(
    <BasisApp router={routerOf(SessionButtons)} signIn={fakeSignIn()} telemetry={telemetry} />,
  );
  await screen.findByText("Dev User, no roles");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Promise.resolve(
        Response.json(
          { status: 401, title: "The bearer token is not valid", type: "invalid-token" },
          { headers: { "content-type": "application/problem+json" }, status: 401 },
        ),
      ),
    ),
  );
  await expect(arrowResponse("/trades")).rejects.toMatchObject({ status: 401 });
  vi.unstubAllGlobals();
  await screen.findByText("nobody");
  expect(sources).toContain("request");
});
