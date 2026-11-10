import "@basis/ui/styles.css";

import { Num, Table, TableBody, TableCell, TableRow } from "@basis/ui";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { ParallaxProvider } from "#react/provider.tsx";
import { useParallaxTheme } from "#react/use-theme.ts";
import { readTheme } from "#theme/read.ts";
import type { Theme } from "#theme/read.ts";

import { startWorker } from "./data.ts";

const ones = "1111111111";
const zeros = "0000000000";

/** A host that reads its tokens as a canvas does, and hands them on. */
function ThemeRead({ onRead }: { readonly onRead: (theme: Theme) => void }): ReactNode {
  const { attributes, read } = useParallaxTheme();
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (element.current !== null) {
      onRead(read(element.current).theme);
    }
  }, [onRead, read]);
  return <div ref={element} {...attributes} />;
}

/** The tokens of `@basis/ui`'s theme, read once its fonts have loaded, and the host they were read on. */
async function basisTokens(): Promise<Theme & { readonly host: HTMLElement }> {
  const { promise, resolve } = Promise.withResolvers<Theme>();
  const screen = await render(
    <ParallaxProvider worker={startWorker}>
      <ThemeRead onRead={resolve} />
    </ParallaxProvider>,
  );
  const theme = await promise;
  await document.fonts.load(theme.font, "0123456789");
  await document.fonts.load(`${theme.fontSizeSmall} ${theme.fontFamily}`, "0123456789");
  const host = screen.container.querySelector<HTMLElement>("[data-px-theme]");
  if (host === null) {
    throw new Error("No host.");
  }
  return { ...theme, host };
}

/** A face of a file the page has loaded, under a name nothing has asked for, added to the page's fonts. */
function unrequestedFace(): FontFace {
  const file = performance
    .getEntriesByType("resource")
    .find((entry) => entry.name.includes("inter-latin-wght-normal"))?.name;
  const face = new FontFace("Unrequested Face", `url(${String(file)})`);
  document.fonts.add(face);
  return face;
}

/** The widths of `texts` on a canvas, in `font`. */
function widths(font: string, ...texts: readonly string[]): readonly number[] {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    throw new Error("No 2D context.");
  }
  context.font = font;
  return texts.map((text) => context.measureText(text).width);
}

describe("digits on the canvas", () => {
  test("are tabular in the grid's and the pivot's font, so a column of numbers lines up", async () => {
    const theme = await basisTokens();
    const [one = 0, zero = 0] = widths(theme.font, ones, zeros);
    expect(one).toBeGreaterThan(0);
    expect(one).toBe(zero);
    // A group's row and the totals draw in a heavier weight of the same face.
    const [strongOne, strongZero] = widths(`${theme.groupFontWeight} ${theme.font}`, ones, zeros);
    expect(strongOne).toBe(strongZero);
  });

  test("are tabular in the axes' font", async () => {
    const theme = await basisTokens();
    const small = `${theme.fontSizeSmall} ${theme.fontFamily}`;
    const [one, zero] = widths(small, ones, zeros);
    expect(one).toBe(zero);
  });

  test("are as wide as the DOM's numbers in a table, at the same size", async () => {
    const theme = await basisTokens();
    const screen = await render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell variant="numeric">
              <Num value={1_111_111_111} decimals={0} thousands={false} />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const shown = screen.container.querySelector("[data-slot=num]");
    if (shown === null) {
      throw new Error("No number shown.");
    }
    expect(shown.textContent).toBe(ones);
    expect(getComputedStyle(shown).fontSize).toBe(theme.fontSize);
    const [canvas = 0] = widths(theme.font, ones);
    expect(shown.getBoundingClientRect().width).toBeCloseTo(canvas, 0);
  });

  test("counts as loading until its face has arrived, which reading the theme sets off", async () => {
    const { host } = await basisTokens();
    const face = unrequestedFace();
    try {
      host.style.setProperty("--px-font-family", '"Unrequested Face"');
      expect(face.status).toBe("unloaded");
      expect(readTheme(host).fontLoaded).toBe(false);
      // Nothing else asked for the face: the read did.
      expect(face.status).toBe("loading");
      await expect.poll(() => readTheme(host).fontLoaded).toBe(true);
    } finally {
      document.fonts.delete(face);
    }
  });
});
