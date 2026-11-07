import "#styles.css";

import { Progress, ProgressLabel, ProgressValue } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

describe("Progress", () => {
  test("is a progressbar named by its label, with its value", async () => {
    const screen = await render(
      <Progress value={40}>
        <ProgressLabel>Morning pricing run</ProgressLabel>
        <ProgressValue />
      </Progress>,
    );
    const bar = screen.getByRole("progressbar", { name: "Morning pricing run" });
    await expect.element(bar).toHaveAttribute("aria-valuenow", "40");
    await expect.element(bar).toHaveAttribute("aria-valuemax", "100");
    await expect.element(screen.getByText("40%")).toBeVisible();
  });

  test("its indicator fills the share of the track its value says", async () => {
    const screen = await render(
      <div className="w-80">
        <Progress value={40} aria-label="Pricing" />
      </div>,
    );
    const bar = screen.getByRole("progressbar", { name: "Pricing" }).element();
    const track = bar.querySelector('[data-slot="progress-track"]');
    const indicator = bar.querySelector('[data-slot="progress-indicator"]');
    expect(track).not.toBeNull();
    expect(indicator).not.toBeNull();
    const trackWidth = track?.getBoundingClientRect().width ?? 0;
    const indicatorWidth = indicator?.getBoundingClientRect().width ?? 0;
    expect(indicatorWidth / trackWidth).toBeCloseTo(0.4, 2);
  });

  test("its value is in tabular figures", async () => {
    const screen = await render(
      <Progress value={100}>
        <ProgressLabel>Risk report</ProgressLabel>
        <ProgressValue />
      </Progress>,
    );
    expect(getComputedStyle(screen.getByText("100%").element()).fontVariantNumeric).toBe(
      "tabular-nums",
    );
  });
});
