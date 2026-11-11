import "#styles.css";

import { themes } from "@basis/ui/theming";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { ThemeStudio } from "./theme-studio.tsx";
import {
  focusPixels,
  radiusPixels,
  themeName,
  withFocus,
  withHue,
  withRadius,
} from "./theme-studio/state.ts";

/** The value of a CSS variable on the preview, which the studio's rules set. */
function previewVariable(name: string): string {
  const preview = document.querySelector('[data-theme="studio"]');
  if (preview === null) {
    throw new Error("The studio shows no preview.");
  }
  return getComputedStyle(preview).getPropertyValue(name).trim();
}

describe("the theme studio's edits", () => {
  const [base] = themes;

  test("change one hue, the radius or the focus ring, and nothing else", () => {
    const brand = withHue(base, "brand", { hue: 300 });
    expect(brand.hues.brand).toStrictEqual({ ...base.hues.brand, hue: 300 });
    expect(brand.hues.neutral).toBe(base.hues.neutral);
    expect(radiusPixels(withRadius(base, 8))).toBe(8);
    expect(withRadius(base, 8).radius.base).toBe("0.5rem");
    expect(withFocus(base, { width: 3 }).focus).toStrictEqual({ ...base.focus, width: "3px" });
    expect(focusPixels("2px")).toBe(2);
  });

  test("name a theme as defineTheme asks", () => {
    expect(themeName("My Brand!")).toBe("my-brand");
    expect(themeName("2026 look")).toBe("theme-2026-look");
    expect(themeName("  ")).toBe("brand");
  });
});

describe("the theme studio", () => {
  test("says the theme it starts from passes checkTheme, and draws the preview with it", async () => {
    const screen = await render(<ThemeStudio />);
    await expect.element(screen.getByText("Passes checkTheme")).toBeVisible();
    expect(previewVariable("--focus-width")).toBe(themes[0].focus.width);
  });

  test("starts again from another shipped theme, and the preview follows at once", async () => {
    const screen = await render(<ThemeStudio />);
    const last = themes.at(-1) ?? themes[0];
    await userEvent.selectOptions(screen.getByLabelText("Start from").element(), last.name);
    expect(previewVariable("--focus-width")).toBe(last.focus.width);
    expect(previewVariable("--radius")).toBe(last.radius.base);
  });

  test("exports under the name given, as defineTheme asks for it", async () => {
    const screen = await render(<ThemeStudio />);
    await userEvent.fill(screen.getByLabelText("Theme name").element(), "Desk Two");
    await expect
      .element(screen.getByRole("button", { name: "Download desk-two.ts" }))
      .toBeVisible();
  });

  test("a change by keyboard on a slider reaches the preview", async () => {
    const screen = await render(<ThemeStudio />);
    const radius = screen.getByRole("slider", { name: "Radius" }).element();
    // Base UI's slider takes the keyboard on its input, which it keeps out of sight.
    if (radius instanceof HTMLElement) {
      radius.focus();
    }
    await userEvent.keyboard("{End}");
    expect(previewVariable("--radius")).toBe("0.75rem");
  });
});
