import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { AccountItem, SavedViews } from "./item.tsx";
import { all, sizeOf } from "./test-helpers.ts";

const variants = ["default", "outline", "muted"] as const;

/** The computed look that tells one item variant from another. */
function lookOf(element: Element): string {
  const style = getComputedStyle(element);
  return [style.backgroundColor, style.borderColor].join(" ");
}

describe("Item", () => {
  test("render makes an item a link, named by its content, to its href", async () => {
    const screen = await render(<SavedViews />);
    const view = screen.getByRole("link", { name: /Morning risk/u });
    await expect.element(view).toHaveAttribute("href", "#morning-risk");
    await expect.element(view).toHaveAttribute("data-slot", "item");
    await expect.element(screen.getByRole("link", { name: "Curve trades" })).toBeVisible();
  });

  test("its action is a button named by its text", async () => {
    const screen = await render(<AccountItem variant="default" size="default" />);
    await expect.element(screen.getByRole("button", { name: "Open" })).toBeVisible();
  });

  test("each variant looks different from every other", async () => {
    const screen = await render(
      <>
        {variants.map((variant) => (
          <AccountItem key={variant} variant={variant} size="default" />
        ))}
      </>,
    );
    const looks = all(screen.container, '[data-slot="item"]').map((item) => lookOf(item));
    expect(new Set(looks).size).toBe(variants.length);
  });

  test("the xs size is shorter than the default and sm sizes", async () => {
    const screen = await render(
      <>
        <AccountItem variant="default" size="default" />
        <AccountItem variant="default" size="sm" />
        <AccountItem variant="default" size="xs" />
      </>,
    );
    const [comfortable, small, extraSmall] = all(screen.container, '[data-slot="item"]').map(
      (item) => sizeOf(item)[1],
    );
    expect(comfortable).toBe(small);
    expect(extraSmall).toBeLessThan(small ?? 0);
  });

  test("a group's separator is a horizontal separator between its items", async () => {
    const screen = await render(<SavedViews />);
    await expect
      .element(screen.getByRole("separator"))
      .toHaveAttribute("aria-orientation", "horizontal");
  });
});
