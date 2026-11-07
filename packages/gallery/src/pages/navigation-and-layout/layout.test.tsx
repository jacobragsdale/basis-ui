import "#styles.css";

import { AspectRatio } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { SeparatedLabels, TenorStrip, TrancheList } from "./layout.tsx";
import { all, only, sizeOf } from "./test-helpers.ts";

describe("ScrollArea", () => {
  test("its viewport takes focus, and the keyboard scrolls what overflows it", async () => {
    const screen = await render(<TrancheList />);
    const viewport = only(screen.container, '[data-slot="scroll-area-viewport"]');
    expect(viewport.tabIndex).toBe(0);
    viewport.focus();
    await userEvent.keyboard("{End}");
    await expect.poll(() => viewport.scrollTop).toBeGreaterThan(0);
  });

  test("it keeps its own height and draws a vertical scrollbar with a thumb", async () => {
    const screen = await render(<TrancheList />);
    const root = only(screen.container, '[data-slot="scroll-area"]');
    expect(sizeOf(root)[1]).toBe(192);
    const scrollbar = only(screen.container, '[data-slot="scroll-area-scrollbar"]');
    await expect.element(scrollbar).toHaveAttribute("data-orientation", "vertical");
    expect(sizeOf(scrollbar)[0]).toBe(10);
  });

  test("a horizontal scrollbar sits along its bottom edge", async () => {
    const screen = await render(<TenorStrip />);
    const scrollbars = all(screen.container, '[data-slot="scroll-area-scrollbar"]');
    const horizontal = scrollbars.find((bar) => bar.dataset["orientation"] === "horizontal");
    expect(horizontal === undefined ? 0 : sizeOf(horizontal)[1]).toBe(10);
  });
});

describe("Separator", () => {
  test("is a separator, horizontal by default and vertical when asked, a pixel thick", async () => {
    const screen = await render(<SeparatedLabels />);
    const separators = screen.getByRole("separator").all();
    expect(separators.map((line) => line.element().getAttribute("aria-orientation"))).toStrictEqual(
      ["horizontal", "vertical", "vertical"],
    );
    const [horizontal, vertical] = separators.map((line) => sizeOf(line.element()));
    expect([horizontal?.[1], vertical?.[0]]).toStrictEqual([1, 1]);
  });
});

describe("AspectRatio", () => {
  test("its height follows its width at the ratio", async () => {
    const screen = await render(
      <div className="w-64">
        <AspectRatio ratio={16 / 9} data-testid="box" />
      </div>,
    );
    expect(sizeOf(screen.getByTestId("box").element())).toStrictEqual([256, 144]);
  });
});
