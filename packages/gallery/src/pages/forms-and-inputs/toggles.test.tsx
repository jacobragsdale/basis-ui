import "#styles.css";

import { FunnelIcon, Toggle, ToggleGroup, ToggleGroupItem } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { ToggleGroupSection, ToggleSection } from "./toggles.tsx";
import { inCompactDensity, lookOf, sizeOf } from "./test-helpers.ts";

const sizes = [
  ["sm", 28],
  ["default", 32],
  ["lg", 36],
] as const;

describe("Toggle", () => {
  test("is a button with aria-pressed, which Space and Enter press and release", async () => {
    const screen = await render(
      <Toggle aria-label="Show filters">
        <FunnelIcon />
      </Toggle>,
    );
    const toggle = screen.getByRole("button", { name: "Show filters" });
    await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
    toggle.element().focus();
    await userEvent.keyboard(" ");
    await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("{Enter}");
    await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
  });

  test("pressed, it sits on the muted surface", async () => {
    const screen = await render(
      <>
        <Toggle>Off</Toggle>
        <Toggle defaultPressed>On</Toggle>
      </>,
    );
    const off = getComputedStyle(screen.getByRole("button", { name: "Off" }).element());
    const on = getComputedStyle(screen.getByRole("button", { name: "On" }).element());
    expect(on.backgroundColor).not.toBe(off.backgroundColor);
  });

  test("its variants differ: outline draws a border", async () => {
    const screen = await render(
      <>
        <Toggle variant="default">Default</Toggle>
        <Toggle variant="outline">Outline</Toggle>
      </>,
    );
    const looks = ["Default", "Outline"].map((name) =>
      lookOf(screen.getByRole("button", { name }).element()),
    );
    expect(new Set(looks).size).toBe(2);
    expect(
      getComputedStyle(screen.getByRole("button", { name: "Outline" }).element()).borderTopWidth,
    ).toBe("1px");
  });

  test.each(sizes)("the %s size is %i px tall", async (size, height) => {
    const screen = await render(
      <Toggle size={size} aria-label="Show filters">
        <FunnelIcon />
      </Toggle>,
    );
    expect(sizeOf(screen.getByRole("button", { name: "Show filters" }).element())[1]).toBe(height);
  });

  test.each(sizes.map(([size]) => size))(
    "the %s size stays at least 24 px across in the compact density",
    async (size) => {
      await inCompactDensity(async () => {
        const screen = await render(
          <Toggle size={size} aria-label="Show filters">
            <FunnelIcon />
          </Toggle>,
        );
        const [width, height] = sizeOf(
          screen.getByRole("button", { name: "Show filters" }).element(),
        );
        expect(width).toBeGreaterThanOrEqual(24);
        expect(height).toBeGreaterThanOrEqual(24);
      });
    },
  );

  test("disabled, it is a disabled button", async () => {
    const screen = await render(<ToggleSection />);
    await expect.element(screen.getByRole("button", { name: "Locked" }).first()).toBeDisabled();
  });
});

describe("ToggleGroup", () => {
  test("is a named group in which pressing one item releases the other", async () => {
    const screen = await render(<ToggleGroupSection />);
    await expect.element(screen.getByRole("group", { name: "Chart range" })).toBeVisible();
    const month = screen.getByRole("button", { name: "1M" });
    const year = screen.getByRole("button", { name: "1Y" });
    await expect.element(month).toHaveAttribute("aria-pressed", "true");
    await year.click();
    await expect.element(year).toHaveAttribute("aria-pressed", "true");
    await expect.element(month).toHaveAttribute("aria-pressed", "false");
  });

  test("the arrow keys move between its items", async () => {
    const screen = await render(<ToggleGroupSection />);
    const day = screen.getByRole("button", { name: "1D" });
    day.element().focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(screen.getByRole("button", { name: "1M" })).toHaveFocus();
  });

  test("a vertical group's arrow keys go up and down", async () => {
    const screen = await render(<ToggleGroupSection />);
    screen.getByRole("button", { name: "Price" }).element().focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(screen.getByRole("button", { name: "Yield" })).toHaveFocus();
  });

  test("with multiple, several stay pressed", async () => {
    const screen = await render(<ToggleGroupSection />);
    await screen.getByRole("button", { name: "Mid" }).click();
    await Promise.all(
      ["Bid", "Ask", "Mid"].map(async (name) =>
        expect
          .element(screen.getByRole("button", { name }))
          .toHaveAttribute("aria-pressed", "true"),
      ),
    );
  });

  test("its spacing sets the gap, and at 0 the items join", async () => {
    const screen = await render(
      <>
        <ToggleGroup aria-label="Apart" variant="outline">
          <ToggleGroupItem value="a">A</ToggleGroupItem>
          <ToggleGroupItem value="b">B</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup aria-label="Joined" variant="outline" spacing={0}>
          <ToggleGroupItem value="c">C</ToggleGroupItem>
          <ToggleGroupItem value="d">D</ToggleGroupItem>
        </ToggleGroup>
      </>,
    );
    const gapOf = (first: string, second: string): number =>
      screen.getByRole("button", { name: second }).element().getBoundingClientRect().left -
      screen.getByRole("button", { name: first }).element().getBoundingClientRect().right;
    expect(gapOf("A", "B")).toBe(8);
    expect(gapOf("C", "D")).toBe(0);
    const joined = getComputedStyle(screen.getByRole("button", { name: "D" }).element());
    expect(joined.borderTopLeftRadius).toBe("0px");
  });

  test("its items take the group's variant and size", async () => {
    const screen = await render(
      <ToggleGroup aria-label="Side" variant="outline" size="sm">
        <ToggleGroupItem value="buy">Buy</ToggleGroupItem>
      </ToggleGroup>,
    );
    const item = screen.getByRole("button", { name: "Buy" });
    await expect.element(item).toHaveAttribute("data-variant", "outline");
    expect(sizeOf(item.element())[1]).toBe(28);
  });
});
