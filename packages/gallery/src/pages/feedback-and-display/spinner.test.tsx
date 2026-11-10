import "#styles.css";

import { Button, Spinner } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { withReducedMotion } from "./test-support.ts";

/** The icon a spinner turns. */
function iconOf(spinner: Element): SVGElement {
  const icon = spinner.querySelector("svg");
  if (icon === null) {
    throw new Error("The spinner has no icon.");
  }
  return icon;
}

describe("Spinner", () => {
  test("is a status named Loading, unless its aria-label says what is loading", async () => {
    const screen = await render(
      <>
        <Spinner />
        <Spinner aria-label="Loading positions" />
      </>,
    );
    await expect
      .element(screen.getByRole("status", { name: "Loading", exact: true }))
      .toBeVisible();
    await expect.element(screen.getByRole("status", { name: "Loading positions" })).toBeVisible();
  });

  test("turns its icon", async () => {
    const screen = await render(<Spinner />);
    const spinner = screen.getByRole("status", { name: "Loading" }).element();
    expect(getComputedStyle(iconOf(spinner)).animationName).toBe("spin");
  });

  test("holds still under reduced motion", async () => {
    const screen = await render(<Spinner />);
    const icon = iconOf(screen.getByRole("status", { name: "Loading" }).element());
    withReducedMotion(() => {
      expect(getComputedStyle(icon).animationName).toBe("none");
    });
  });

  test("holds still when the user's motion preference is reduced, as the user menu sets it", async () => {
    const screen = await render(<Spinner />);
    const icon = iconOf(screen.getByRole("status", { name: "Loading" }).element());
    document.documentElement.dataset["motion"] = "reduced";
    try {
      expect(getComputedStyle(icon).animationName).toBe("none");
    } finally {
      delete document.documentElement.dataset["motion"];
    }
  });

  test("is 16 px square, and className sizes it", async () => {
    const screen = await render(
      <>
        <Spinner />
        <Spinner className="size-6" aria-label="Loading positions" />
      </>,
    );
    const small = screen.getByRole("status", { name: "Loading", exact: true }).element();
    const large = screen.getByRole("status", { name: "Loading positions" }).element();
    expect(iconOf(small).getBoundingClientRect().width).toBe(16);
    expect(iconOf(large).getBoundingClientRect().width).toBe(24);
  });

  test("keeps its size in a small Button, which sizes plain icons smaller", async () => {
    const screen = await render(
      <Button size="xs" disabled>
        <Spinner data-icon="inline-start" aria-hidden />
        Saving
      </Button>,
    );
    const icon = screen.getByRole("button", { name: "Saving" }).element().querySelector("svg");
    expect(icon?.getBoundingClientRect().width).toBe(16);
  });
});
