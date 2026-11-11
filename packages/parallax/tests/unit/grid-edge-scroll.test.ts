import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { EdgeScroll } from "#grid/edge-scroll.ts";
import type { GridHost } from "#grid/host.ts";

/** Whether `value` answers what edge scrolling asks of a grid's host, as the fake below does. */
function scrollsLikeHost(value: unknown): value is GridHost {
  return value instanceof Object && "dom" in value && "metrics" in value;
}

/** A host whose canvas is 400 by 300 pixels, under a 30 pixel header with rows of 24, counting its scrolls. */
function hostOf(scrolls: { left?: number; top?: number }[]): GridHost {
  const host: unknown = {
    dom: {
      parts: {
        canvas: { clientHeight: 300, clientWidth: 400 },
        scroll: {
          scrollBy: (by: { left?: number; top?: number }): void => {
            scrolls.push(by);
          },
        },
      },
    },
    metrics: () => ({ headerPx: 30, rowPx: 24 }),
  };
  if (!scrollsLikeHost(host)) {
    throw new TypeError("The fake is no host.");
  }
  return host;
}

afterEach(() => {
  vi.useRealTimers();
});

describe(EdgeScroll, () => {
  test("scrolls a row at a time while a drag is below the body, and stops once it is back in", () => {
    vi.useFakeTimers();
    const scrolls: { left?: number; top?: number }[] = [];
    const edge = new EdgeScroll(hostOf(scrolls));
    edge.follow(200, 320);
    vi.advanceTimersByTime(120);
    expect(scrolls).toStrictEqual([
      { left: 0, top: 24 },
      { left: 0, top: 24 },
      { left: 0, top: 24 },
    ]);
    edge.follow(200, 100);
    vi.advanceTimersByTime(200);
    expect(scrolls).toHaveLength(3);
  });

  test("scrolls up above the body and left before it", () => {
    const scrolls: { left?: number; top?: number }[] = [];
    const edge = new EdgeScroll(hostOf(scrolls));
    edge.follow(-5, 10);
    edge.stop();
    expect(scrolls).toStrictEqual([{ left: -40, top: -24 }]);
  });
});
