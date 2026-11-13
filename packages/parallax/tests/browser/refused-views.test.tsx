/* Views the engine refuses: one it never opened opens once its layout is corrected, and one that refused a change
 * draws again on the layout it kept. */

import type { ReactNode } from "react";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import type { ViewHandle } from "#engine/view.ts";
import type { LayoutInput } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";

import { byFund, startWorker } from "./data.ts";
import { Pivot } from "./pivot.tsx";

describe("a view the engine refuses", () => {
  test("open a view the engine refused once its layout is corrected", async () => {
    const missing = { group_by: ["region"] } satisfies LayoutInput;
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Pivot layout={missing} />
      </ParallaxProvider>,
    );
    await expect.element(screen.getByLabelText("view")).toHaveTextContent("failed");
    await expect.element(screen.getByLabelText("view error")).toMatchTextContent(/region/u);
    await screen.rerender(
      <ParallaxProvider worker={startWorker}>
        <Pivot layout={byFund} />
      </ParallaxProvider>,
    );
    await expect.element(screen.getByText("Atlas: 250.75")).toBeVisible();
    await expect.element(screen.getByLabelText("view")).toHaveTextContent("open");
    await expect.element(screen.getByLabelText("view error")).toHaveTextContent("");
  });

  test("draw again after the engine refuses a change, which leaves the view on its layout before", async () => {
    const handles = new Set<ViewHandle>();
    const page = (layout: LayoutInput): ReactNode => (
      <ParallaxProvider worker={startWorker}>
        <Pivot handles={handles} layout={layout} />
      </ParallaxProvider>
    );
    const screen = await render(page(byFund));
    await expect.element(screen.getByText("Atlas: 250.75")).toBeVisible();
    await screen.rerender(page({ ...byFund, titles: { region: "Region" } }));
    await expect.element(screen.getByLabelText("view error")).toMatchTextContent(/region/u);
    // A window the engine answers on the layout it kept is drawn.
    const [handle] = handles;
    handle?.setViewport({ columnCount: 10, firstColumn: 0, firstRow: 1, rowCount: 10 });
    await expect.element(screen.getByRole("listitem").first()).toHaveTextContent("Atlas: 250.75");
  });
});
