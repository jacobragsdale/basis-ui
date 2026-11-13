/* The provider when the signed-in user changes, as `@basis/ui`'s shell says with a `basis:sessionchange` event on the
 * window: it drops every dataset and view, so one user's rows never show for the next, and each dataset loads again
 * from its source, one that failed for want of a sign-in among them. */

import type { ReactNode } from "react";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { ParallaxProvider } from "#react/provider.tsx";
import { useDataset } from "#react/use-dataset.ts";
import { useView } from "#react/use-view.ts";

import { countedBytes, startWorker } from "./data.ts";

/** Who the source answers for: each user sees as many rows as their name is long, and nobody none. */
const session = { user: null as string | null };

/** The rows the signed-in user may see, or a refusal. */
function rowsForUser(): ArrayBuffer {
  if (session.user === null) {
    throw new Error("sign-in-required");
  }
  return countedBytes(session.user.length);
}

/** The dataset's state and its view's rows, as text. */
function Shown(): ReactNode {
  const values = useDataset("values", rowsForUser);
  const view = useView(values, {});
  return (
    <section>
      <output aria-label="values">{`${values.status} ${values.error ?? String(values.rows)}`}</output>
      <output aria-label="view rows">{String(view.frame?.totalRows ?? "")}</output>
    </section>
  );
}

/** Says that the signed-in user is now `user`, as the shell does. */
function signIn(user: string | null): void {
  session.user = user;
  globalThis.dispatchEvent(new CustomEvent("basis:sessionchange", { detail: { userId: user } }));
}

describe("a change of the signed-in user", () => {
  test("drops what the user before loaded, and loads each dataset again for the next", async () => {
    session.user = "alexandra";
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Shown />
      </ParallaxProvider>,
    );
    await expect.element(screen.getByLabelText("view rows")).toHaveTextContent("9");
    signIn(null);
    await expect
      .element(screen.getByLabelText("values"))
      .toHaveTextContent("failed sign-in-required");
    await expect.element(screen.getByLabelText("view rows")).toHaveTextContent("");
    signIn("bo");
    await expect.element(screen.getByLabelText("values")).toHaveTextContent("loaded 2");
    await expect.element(screen.getByLabelText("view rows")).toHaveTextContent("2");
  });
});
