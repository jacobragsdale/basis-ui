/* The demo's frame: its sidebar of pages, the mode and density it sets for every app of the firm, and its tools. */

import { readPreferences, writePreferences } from "@basis/ui";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { renderDemo } from "#test-support.tsx";

afterEach(() => {
  writePreferences({ density: "comfortable", mode: "light" });
  document.body.removeAttribute("style");
  localStorage.clear();
});

describe("the sidebar", () => {
  test("lists every page in its group, marks the one shown, and moves to another", async () => {
    const screen = await renderDemo("/small-charts");
    const pages = screen.getByRole("navigation", { name: "Pages" });
    await expect
      .element(pages.getByRole("link", { name: "Small charts" }))
      .toHaveAttribute("aria-current", "page");
    expect(
      pages
        .getByRole("link")
        .all()
        .map((link) => link.element().textContent),
    ).toStrictEqual([
      "Positions pivot",
      "150,000 trades",
      "Largest trades",
      "Daily prices",
      "Small tables",
      "Data from the app",
      "Dashboard",
      "Breakdowns",
      "Charts",
      "Technical analysis",
      "Small charts",
      "Fixed income",
    ]);
    await pages.getByRole("link", { name: "Data from the app" }).click();
    await expect.element(screen.getByRole("heading", { name: "Data from the app" })).toBeVisible();
  });

  test("sets the mode and the density in the preferences every app shares", async () => {
    const screen = await renderDemo("/small-charts");
    await screen.getByRole("button", { name: "Appearance" }).click();
    await screen.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect.poll(() => document.documentElement.classList.contains("dark")).toBe(true);
    // A choice leaves the menu open, as a radio item's does.
    await screen.getByRole("menuitemradio", { name: "Compact" }).click();
    await expect.poll(() => document.documentElement.dataset["density"]).toBe("compact");
    expect(readPreferences()).toStrictEqual({ density: "compact", mode: "dark" });
  });
});

describe("the tools", () => {
  test("the performance overlay shows its figures, and goes when asked", async () => {
    const screen = await renderDemo("/small-charts");
    const toggle = screen.getByRole("button", { name: "Performance" });
    await toggle.click();
    await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
    const overlay = screen.getByRole("region", { name: "Performance" });
    await expect.element(overlay.getByText("Frame time")).toBeVisible();
    await expect.element(overlay.getByText("Memory covers")).toBeVisible();
    await toggle.click();
    await expect.element(overlay).not.toBeInTheDocument();
  });

  test("the theme studio sets parallax's tokens on the page, shows them as CSS, and resets them", async () => {
    const screen = await renderDemo("/small-charts");
    await screen.getByRole("button", { name: "Theme studio" }).click();
    const studio = screen.getByRole("dialog", { name: "Theme studio" });
    await studio.getByLabelText("Accent").fill("#7c3aed");
    await expect.poll(() => document.body.style.getPropertyValue("--px-accent")).toBe("#7c3aed");
    await studio.getByRole("switch", { name: "Stripes" }).click();
    await expect
      .poll(() => document.body.style.getPropertyValue("--px-stripe"))
      .toBe("transparent");
    await expect
      .element(studio.getByTestId("studio-css"))
      .toHaveTextContent(":root { --px-accent: #7c3aed; --px-stripe: transparent; }");
  });

  test("the theme studio keeps its theme for the next visit, until Reset takes it away", async () => {
    const screen = await renderDemo("/small-charts");
    await screen.getByRole("button", { name: "Theme studio" }).click();
    const studio = screen.getByRole("dialog", { name: "Theme studio" });
    await studio.getByLabelText("Accent").fill("#7c3aed");
    await expect
      .poll(() => localStorage.getItem("parallax-demo-theme-studio"))
      .toBe('{"--px-accent":"#7c3aed"}');
    await studio.getByRole("button", { name: "Reset" }).click();
    await expect.poll(() => document.body.style.getPropertyValue("--px-accent")).toBe("");
    expect(localStorage.getItem("parallax-demo-theme-studio")).toBe("{}");
  });
});
