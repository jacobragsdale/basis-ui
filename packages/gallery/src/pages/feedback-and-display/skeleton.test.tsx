import "#styles.css";

import { Skeleton } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { computedColour, pixels } from "./test-support.ts";

describe("Skeleton", () => {
  test("is a muted block, as large as className makes it, that holds still, so a page loading sends no screen changes", async () => {
    const screen = await render(<Skeleton className="h-4 w-32" data-testid="skeleton" />);
    const skeleton = screen.getByTestId("skeleton").element();
    const style = getComputedStyle(skeleton);
    expect(style.backgroundColor).toBe(computedColour("var(--muted)"));
    expect(style.animationName).toBe("none");
    expect(skeleton.getAnimations()).toStrictEqual([]);
    const box = skeleton.getBoundingClientRect();
    expect([box.width, box.height]).toStrictEqual([128, 16]);
  });

  test("the circle variant is round, and the default only rounds its corners", async () => {
    const screen = await render(
      <>
        <Skeleton className="size-10" data-testid="block" />
        <Skeleton variant="circle" className="size-10" data-testid="circle" />
      </>,
    );
    const block = pixels(
      getComputedStyle(screen.getByTestId("block").element()).borderTopLeftRadius,
    );
    const circle = pixels(
      getComputedStyle(screen.getByTestId("circle").element()).borderTopLeftRadius,
    );
    expect(block).toBeGreaterThan(0);
    expect(block).toBeLessThan(20);
    expect(circle).toBeGreaterThanOrEqual(20);
  });
});
