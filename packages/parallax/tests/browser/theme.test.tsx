import "@basis/ui/styles.css";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { inkOn } from "#chart/ink.ts";
import { ParallaxProvider } from "#react/provider.tsx";
import { useParallaxTheme } from "#react/use-theme.ts";
import type { ChartColors } from "#theme/charts.ts";
import { airyTheme } from "#theme/looks.ts";

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

/** The colour a CSS colour value paints, as `rgb(r, g, b)`, read back off a canvas. */
function painted(value: string): string {
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (context === null) {
    throw new Error("No 2D context.");
  }
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
  return `rgb(${String(red)}, ${String(green)}, ${String(blue)})`;
}

/** The chart colours a host reads, with its colour tokens' values as `getComputedStyle` gives them. */
function ChartColorsRead({
  onRead,
}: {
  readonly onRead: (colors: ChartColors) => void;
}): ReactNode {
  const { attributes, read } = useParallaxTheme();
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (element.current !== null) {
      onRead(read(element.current).colors);
    }
  }, [onRead, read]);
  return <div ref={element} {...attributes} />;
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
      .toMatchTextContent(/^14px "Inter Tabular", "Inter Variable"/u);
  });

  test("reads its colours as oklch(), on which labels take the ink that contrasts, white or dark", async () => {
    const { promise, resolve } = Promise.withResolvers<ChartColors>();
    await render(
      <ParallaxProvider worker={startWorker}>
        <ChartColorsRead onRead={resolve} />
      </ParallaxProvider>,
    );
    const { ramp } = await promise;
    // A registered colour property computes to the form it was written in: @basis/ui writes OKLCH.
    expect(ramp[0]).toMatch(/^oklch\(/u);
    const inks = ramp.map((color) => inkOn(color));
    expect(inks).toStrictEqual(ramp.map((color) => inkOn(painted(color))));
    expect(new Set(inks)).toStrictEqual(new Set(["#ffffff", "#111827"]));
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

  test("gives its hosts a scheme of its own when told one, and its theme's name", async () => {
    document.documentElement.dataset["density"] = "compact";
    const screen = await render(
      <ParallaxProvider worker={startWorker} scheme="dark" theme={airyTheme}>
        <Swatch />
      </ParallaxProvider>,
    );
    const host = screen.getByLabelText("scheme").element().parentElement;
    expect(host?.dataset).toMatchObject({
      pxScheme: "dark",
      pxTheme: "airy",
    });
  });
});
