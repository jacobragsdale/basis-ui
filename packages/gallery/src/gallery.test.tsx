import "#styles.css";

import { defaultPreferences } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { Gallery } from "./gallery.tsx";
import { pageFor, pages } from "./pages.ts";
import { queryPreferences } from "./preferences.ts";

const stored = { density: "compact", mode: "light", motion: "full" } as const;

describe(queryPreferences, () => {
  test("is null when the query names neither the mode nor the density", () => {
    expect(queryPreferences("?page=forms-and-inputs", stored)).toBeNull();
  });

  test("takes the mode and the density the query names", () => {
    expect(queryPreferences("?mode=dark&density=comfortable", stored)).toStrictEqual({
      density: "comfortable",
      mode: "dark",
      motion: "full",
    });
  });

  test("keeps the stored choice for the one the query leaves out", () => {
    expect(queryPreferences("?mode=dark", stored)).toStrictEqual({
      density: "compact",
      mode: "dark",
      motion: "full",
    });
    expect(queryPreferences("?density=comfortable", defaultPreferences)).toStrictEqual({
      density: "comfortable",
      mode: "system",
      motion: "full",
    });
  });

  test("ignores values it does not know", () => {
    expect(queryPreferences("?mode=sepia&density=roomy", stored)).toBeNull();
  });
});

describe(pageFor, () => {
  test("finds the page the query names", () => {
    expect(pageFor("?page=feedback-and-display").title).toBe("Feedback and display");
  });

  test("falls back to the first page", () => {
    expect(pageFor("?page=nowhere")).toBe(pages[0]);
    expect(pageFor("")).toBe(pages[0]);
  });
});

describe("the gallery", () => {
  const search = "?page=navigation-and-layout&mode=dark";

  test("links to every family's page, and marks the current one", async () => {
    const page = pageFor(search);
    const screen = await render(
      <Gallery page={page} search={search} mode="dark" density="comfortable" />,
    );
    const families = screen.getByRole("navigation", { name: "Component families" });
    const titles = families
      .getByRole("link")
      .all()
      .map((link) => link.element().textContent);
    expect(titles).toStrictEqual(pages.map(({ title }) => title));
    await expect
      .element(families.getByRole("link", { name: page.title }))
      .toHaveAttribute("aria-current", "page");
    await expect.element(screen.getByRole("heading", { level: 1, name: page.title })).toBeVisible();
  });

  test("its mode and density links keep the page and change one preference", async () => {
    const screen = await render(
      <Gallery page={pageFor(search)} search={search} mode="dark" density="comfortable" />,
    );
    const density = screen.getByRole("navigation", { name: "Density" });
    await expect
      .element(density.getByRole("link", { name: "compact" }))
      .toHaveAttribute("href", "?page=navigation-and-layout&mode=dark&density=compact");
    await expect
      .element(density.getByRole("link", { name: "comfortable" }))
      .toHaveAttribute("aria-current", "true");
    const mode = screen.getByRole("navigation", { name: "Mode" });
    await expect
      .element(mode.getByRole("link", { name: "light" }))
      .toHaveAttribute("href", "?page=navigation-and-layout&mode=light");
  });
});
