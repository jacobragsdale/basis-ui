import "#styles.css";

import { Slider } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { SliderSection } from "./slider.tsx";
import { inCompactDensity, sizeOf } from "./test-helpers.ts";

describe("Slider", () => {
  test("is a slider named by its aria-label, which the arrow keys move", async () => {
    const screen = await render(<Slider defaultValue={25} aria-label="Hedge ratio" />);
    const slider = screen.getByRole("slider", { name: "Hedge ratio" });
    await expect.element(slider).toHaveAttribute("aria-valuenow", "25");
    slider.element().focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(slider).toHaveAttribute("aria-valuenow", "26");
    await userEvent.keyboard("{End}");
    await expect.element(slider).toHaveAttribute("aria-valuenow", "100");
  });

  test("one number draws one thumb, and a pair draws a range of two", async () => {
    const screen = await render(<SliderSection />);
    expect(screen.getByRole("slider", { name: "Hedge ratio" }).all()).toHaveLength(1);
    const range = screen.getByRole("slider", { name: "Maturity in years" }).all();
    expect(range.map((thumb) => thumb.element().getAttribute("aria-valuenow"))).toStrictEqual([
      "2",
      "10",
    ]);
  });

  test("with no value yet, it draws one thumb", async () => {
    const screen = await render(<Slider aria-label="Fill rate" />);
    expect(screen.getByRole("slider", { name: "Fill rate" }).all()).toHaveLength(1);
  });

  test("disabled, the arrow keys leave it", async () => {
    const screen = await render(<Slider defaultValue={60} disabled aria-label="Fill rate" />);
    const slider = screen.getByRole("slider", { name: "Fill rate" });
    await expect.element(slider).toBeDisabled();
  });

  test("vertical, it is marked so and the arrow keys still move it", async () => {
    const screen = await render(<SliderSection />);
    const volume = screen.getByRole("slider", { name: "Volume" });
    await expect.element(volume).toHaveAttribute("aria-orientation", "vertical");
    volume.element().focus();
    await userEvent.keyboard("{ArrowUp}");
    await expect.element(volume).toHaveAttribute("aria-valuenow", "41");
  });

  test("each thumb is a 24 px target in either density", async () => {
    const screen = await render(<Slider defaultValue={[2, 10]} aria-label="Range" />);
    for (const thumb of screen.container.querySelectorAll('[data-slot="slider-thumb"]')) {
      expect(sizeOf(thumb)).toStrictEqual([24, 24]);
    }
    await inCompactDensity(async () => {
      const compact = await render(<Slider defaultValue={50} aria-label="Compact" />);
      const thumb = compact.container.querySelector('[data-slot="slider-thumb"]');
      expect(thumb === null ? [] : sizeOf(thumb)).toStrictEqual([24, 24]);
    });
  });
});
