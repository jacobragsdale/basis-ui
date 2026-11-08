import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { AppShellSection, EnvironmentBannerSection } from "./shell-parts.tsx";

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

  test("the banner names each environment", async () => {
    const screen = await render(<EnvironmentBannerSection />);
    await expect
      .element(screen.getByText("Development: positions-api on this desktop"))
      .toBeVisible();
    await expect.element(screen.getByText("Production")).toBeVisible();
  });
});
