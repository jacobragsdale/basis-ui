/* What the demo's tests share: the demo rendered at an address in BasisApp, on a memory history, as an anonymous user,
 * with the engine's worker from @basis/parallax's build, as the demo runs it. */

import { BasisApp, fakeSignIn } from "@basis/ui";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { render } from "vitest-browser-react";
import type { RenderResult } from "vitest-browser-react";

import { routeTree } from "./routes.ts";

import "./styles.css";

/** The demo at `path`, as a visitor sees it. */
async function renderDemo(path: string): Promise<RenderResult> {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree,
  });
  return render(<BasisApp router={router} signIn={fakeSignIn({ user: null })} />);
}

export { renderDemo };
