import { describe, expect, test } from "vite-plus/test";

import { previewPlacement } from "#chart/zoom-preview.ts";
import { linearScale } from "#chart/scale.ts";

/** A plot 200 pixels wide from x 10, over values 0 to 100, from y 5 to 105. */
const scale = linearScale([0, 100], [10, 210]);
const plot = { bottom: 105, top: 5 };

describe(previewPlacement, () => {
  test("stretches the plot as painted to a zoom in: the half asked for fills the plot", () => {
    expect(previewPlacement(scale, plot, [25, 75])).toStrictEqual({
      from: { height: 100, width: 200, x: 10, y: 5 },
      to: { height: 100, width: 400, x: -90, y: 5 },
    });
  });

  test("moves the plot as painted for a pan, by the pixels the range moved", () => {
    expect(previewPlacement(scale, plot, [10, 110])?.to).toStrictEqual({
      height: 100,
      width: 200,
      x: -10,
      y: 5,
    });
  });

  test("leaves a log scale, or an empty range, to the engine's answer", () => {
    expect(previewPlacement({ ...scale, log: true }, plot, [10, 20])).toBeNull();
    expect(previewPlacement(scale, plot, [20, 20])).toBeNull();
  });
});
