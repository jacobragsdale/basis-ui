import "#styles.css";
/* HeatCell and DescriptionList, rendered alone: the step and ink of a heat cell in each mode, and a list of facts. */

import { DescriptionList, HeatCell } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

/** The heat cell around the text, with its step and its ink. */
function cellOf(text: string): HTMLElement {
  const cell = document.querySelector(`[data-slot="heat-cell"]:has(> span[data-text="${text}"])`);
  if (!(cell instanceof HTMLElement)) {
    throw new TypeError(`No heat cell holds ${text}.`);
  }
  return cell;
}

/** Runs `check` in dark mode, announced as the preferences announce it, then puts light mode back. */
async function inDarkMode(check: () => Promise<void>): Promise<void> {
  const root = document.documentElement;
  const announce = (): void => {
    root.dispatchEvent(new Event("basis:themechange", { bubbles: true }));
  };
  root.classList.add("dark");
  announce();
  try {
    await check();
  } finally {
    root.classList.remove("dark");
    announce();
  }
}

describe("HeatCell", () => {
  test("fills its step, with the ink that reads on it, or the next step out where none does", async () => {
    const screen = await render(
      <>
        <HeatCell value={1} scale="sequential" min={0} max={9}>
          <span data-text="low">low</span>
        </HeatCell>
        <HeatCell value={6} scale="sequential" min={0} max={9}>
          <span data-text="mid">mid</span>
        </HeatCell>
        <HeatCell value={9} scale="sequential" min={0} max={9}>
          <span data-text="high">high</span>
        </HeatCell>
      </>,
    );
    await expect.element(screen.getByText("high")).toBeVisible();
    expect(cellOf("low").dataset["heat"]).toBe("seq-1");
    expect(cellOf("low").classList.contains("text-foreground")).toBe(true);
    expect(cellOf("high").classList.contains("text-background")).toBe(true);
    // In the default theme's light mode, seq-6 reads at 5.5:1 with neither ink, so the cell shows a step further out.
    expect(Number(cellOf("mid").dataset["heat"]?.replace("seq-", ""))).toBeGreaterThan(6);
    expect(cellOf("mid").classList.contains("text-background")).toBe(true);
  });

  test("measures again when the mode changes", async () => {
    const screen = await render(
      <HeatCell value={9} scale="sequential" min={0} max={9}>
        <span data-text="high">high</span>
      </HeatCell>,
    );
    await expect.element(screen.getByText("high")).toBeVisible();
    const before = getComputedStyle(cellOf("high")).color;
    await inDarkMode(async () => {
      // The page's background, the ink on the darkest step in light mode, is dark in dark mode, on the lightest.
      await expect.poll(() => getComputedStyle(cellOf("high")).color).not.toBe(before);
      expect(cellOf("high").classList.contains("text-background")).toBe(true);
    });
  });

  test("shows no heat for a missing value", async () => {
    const screen = await render(
      <HeatCell value={null} scale="diverging" min={-1} max={1}>
        <span data-text="none">—</span>
      </HeatCell>,
    );
    await expect.element(screen.getByText("—")).toBeVisible();
    expect(cellOf("none").dataset["heat"]).toBeUndefined();
  });
});

describe("DescriptionList", () => {
  test("is a list of terms and their values", async () => {
    const screen = await render(
      <DescriptionList
        aria-label="Terms"
        items={[
          { description: "4.125%", term: "Coupon" },
          { description: "2036-05-15", term: "Maturity" },
        ]}
      />,
    );
    const list = screen.getByLabelText("Terms");
    expect(list.element().tagName).toBe("DL");
    expect(
      [...list.element().querySelectorAll("dt")].map((term) => term.textContent),
    ).toStrictEqual(["Coupon", "Maturity"]);
    expect(list.element().querySelector("dd")?.textContent).toBe("4.125%");
  });
});
