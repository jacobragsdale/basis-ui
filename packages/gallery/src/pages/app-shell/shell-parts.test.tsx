import "#styles.css";

import { preferencesCookie } from "@basis/ui";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { AppShellSection, EnvironmentBannerSection } from "./shell-parts.tsx";

/** Puts the page's root back as the tests found it: light, comfortable, and no stored choice. */
afterEach(async () => {
  const root = document.documentElement;
  root.classList.remove("dark");
  root.style.colorScheme = "";
  delete root.dataset["density"];
  await cookieStore.delete(preferencesCookie);
});

describe("the app shell's parts", () => {
  test("AppShell runs in its frame: the sidebar's pages, the breadcrumbs and the QA banner", async () => {
    const screen = await render(<AppShellSection />);
    const app = screen.getByRole("region", { name: "An app on the shell" });
    await expect.element(app.getByRole("heading", { level: 1, name: "Positions" })).toBeVisible();
    await expect.element(app.getByRole("link", { name: "Trades" })).toBeVisible();
    await expect.element(app.getByRole("link", { name: "Book a trade" })).toBeVisible();
    await expect.element(app.getByText("QA", { exact: true })).toBeVisible();
  });

  test("a sidebar link moves the framed app to its page, and the breadcrumbs follow", async () => {
    const screen = await render(<AppShellSection />);
    const app = screen.getByRole("region", { name: "An app on the shell" });
    await app.getByRole("link", { name: "Trades" }).click();
    await expect.element(app.getByRole("heading", { level: 1, name: "Trades" })).toBeVisible();
  });

  test("the banner sits above the sidebar, and the shell fills its frame without scrolling", async () => {
    await page.viewport(1280, 800);
    const screen = await render(<AppShellSection />);
    const app = screen.getByRole("region", { name: "An app on the shell" });
    // The framed app's router is the page's, so it may be on any of its pages.
    await expect.element(app.getByRole("heading", { level: 1 })).toBeVisible();
    const frame = app.element();
    const [banner, sidebar] = ["environment-banner", "sidebar-container"].map((slot) =>
      frame.querySelector(`[data-slot="${slot}"]`)?.getBoundingClientRect(),
    );
    const inside = frame.getBoundingClientRect().top + frame.clientTop + frame.clientHeight;
    expect([
      (sidebar?.top ?? 0) >= (banner?.bottom ?? Infinity),
      (sidebar?.bottom ?? Infinity) <= inside,
      frame.scrollHeight === frame.clientHeight,
    ]).toStrictEqual([true, true, true]);
  });

  test("the framed app shows the mode and density it is told, over the stored choice", async () => {
    await cookieStore.set(preferencesCookie, "light.comfortable");
    const screen = await render(
      <AppShellSection preferences={{ density: "compact", mode: "dark" }} />,
    );
    const app = screen.getByRole("region", { name: "An app on the shell" });
    await expect.element(app.getByRole("heading", { level: 1 })).toBeVisible();
    const root = document.documentElement;
    expect([root.classList.contains("dark"), root.dataset["density"]]).toStrictEqual([
      true,
      "compact",
    ]);
  });

  test("the banner names each environment", async () => {
    const screen = await render(<EnvironmentBannerSection />);
    await expect
      .element(screen.getByText("Development: positions-api on this desktop"))
      .toBeVisible();
    await expect.element(screen.getByText("Production")).toBeVisible();
  });
});
