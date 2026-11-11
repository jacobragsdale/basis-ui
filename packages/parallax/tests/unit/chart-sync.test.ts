import { describe, expect, test } from "vite-plus/test";

import { PointerSync, concerns } from "#chart/sync.ts";

describe(PointerSync, () => {
  test("tells each listener where the pointer is and where it was, so a chart of another group draws nothing", () => {
    const sync = new PointerSync();
    const heard: [string | null, string | null][] = [];
    sync.subscribe((now, was) => {
      heard.push([now?.group ?? null, was?.group ?? null]);
    });
    const source = {};
    sync.set({ group: "prices", source, x: 1 });
    sync.set({ group: "rates", source, x: 2 });
    sync.release(source);
    expect(heard).toStrictEqual([
      ["prices", null],
      ["rates", "prices"],
      [null, "rates"],
    ]);
  });

  test("concerns a chart only when its group is where the pointer is or was", () => {
    const source = {};
    const prices = { group: "prices", source, x: 1 };
    expect(concerns("prices", prices, null)).toBe(true);
    expect(concerns("prices", null, prices)).toBe(true);
    expect(concerns("rates", prices, null)).toBe(false);
    expect(concerns(null, prices, prices)).toBe(false);
  });
});
