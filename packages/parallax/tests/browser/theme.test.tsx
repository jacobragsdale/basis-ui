import "@basis/ui/styles.css";

import { afterEach, describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { ParallaxProvider } from "#react/provider.tsx";
import { airyTheme } from "#theme/define.ts";

import { startWorker } from "./data.ts";
import { Swatch } from "./swatch.tsx";

/** The colour a CSS colour value computes to, as the page resolves it now. */
function computed(value: string): string {
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.append(probe);
  const { color } = getComputedStyle(probe);
  probe.remove();
  return color;
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
  delete document.documentElement.dataset["density"];
});

describe("ParallaxProvider's theme", () => {
  test("draws in @basis/ui's tokens, read as concrete colours", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Swatch />
      </ParallaxProvider>,
    );
    await expect
      .element(screen.getByLabelText("accent"))
      .toHaveTextContent(computed("var(--primary)"));
    await expect
      .element(screen.getByLabelText("background"))
      .toHaveTextContent(computed("var(--card)"));
    await expect
      .element(screen.getByLabelText("series"))
      .toHaveTextContent(computed("var(--chart-1)"));
    // Every step of @basis/ui's sequential scale.
    await expect.element(screen.getByLabelText("ramp")).toHaveTextContent("9");
    await expect
      .element(screen.getByLabelText("font"))
      .toMatchTextContent(/^13px "Inter Variable"/u);
  });

  test("follows the page into dark mode, and its canvases read their tokens again", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Swatch />
      </ParallaxProvider>,
    );
    const light = computed("var(--primary)");
    await expect.element(screen.getByLabelText("accent")).toHaveTextContent(light);
    document.documentElement.classList.add("dark");
    const dark = computed("var(--primary)");
    expect(dark).not.toBe(light);
    await expect.element(screen.getByLabelText("scheme")).toHaveTextContent("dark");
    await expect.element(screen.getByLabelText("accent")).toHaveTextContent(dark);
    await expect
      .element(screen.getByLabelText("background"))
      .toHaveTextContent(computed("var(--card)"));
  });

  test("gives its hosts the page's density, and a scheme of its own when told one", async () => {
    document.documentElement.dataset["density"] = "compact";
    const screen = await render(
      <ParallaxProvider worker={startWorker} scheme="dark" theme={airyTheme}>
        <Swatch />
      </ParallaxProvider>,
    );
    const host = screen.getByLabelText("scheme").element().parentElement;
    expect(host?.dataset).toMatchObject({
      pxDensity: "compact",
      pxScheme: "dark",
      pxTheme: "airy",
    });
  });
});
