/* The pages that need no generated data, with the engine's real worker: the app's own data, and the small charts. */

import { describe, expect, test } from "vite-plus/test";

import { renderDemo } from "#test-support.tsx";

describe("data from the app", () => {
  test("loads the sample the app makes into the worker, and shows it whole", async () => {
    const screen = await renderDemo("/data-from-the-app");
    await expect
      .element(screen.getByRole("grid", { name: "orders" }))
      .toHaveAttribute("aria-rowcount", "2000");
    await expect.element(screen.getByText("At most 150,000 rows or 70 MB of Arrow")).toBeVisible();
  });
});

describe("small charts", () => {
  test("draws each chart from the rows the page holds", async () => {
    const screen = await renderDemo("/small-charts");
    const plots = screen.getByRole("application");
    await expect.poll(() => plots.all().length).toBe(5);
    await expect
      .element(screen.getByRole("application", { name: /^Bar chart of sector/u }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("application", { name: /^Line chart of nav/u }))
      .toBeVisible();
  });
});
