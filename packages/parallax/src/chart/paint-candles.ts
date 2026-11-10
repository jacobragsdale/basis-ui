/* Painting candles and OHLC bars: a wick from the high to the low, then a body, hollow when the candle rose and filled
 * when it fell, or an OHLC bar's ticks for its open and close. */

import { hairline } from "#canvas/device-pixels.ts";

import { half, style } from "./paint-canvas.ts";
import type { Painting } from "./paint-canvas.ts";
import type { CandleMark } from "./model-types.ts";

/** An OHLC bar's line width; a candle's wick is a CSS pixel, on whole device pixels. */
const barsWidth = 1.5;

/** An OHLC bar's ticks: the open ticks left, the close ticks right. */
function paintTicks({ ctx }: Painting, mark: CandleMark, x: number): void {
  const tick = Math.max(1, mark.width / 2);
  ctx.moveTo(x - tick, mark.open);
  ctx.lineTo(x, mark.open);
  ctx.moveTo(x, mark.close);
  ctx.lineTo(x + tick, mark.close);
  ctx.stroke();
}

/** A candle's body: hollow on a rising candle, filled on a falling one. */
function paintBody({ ctx, theme }: Painting, mark: CandleMark): void {
  const body = {
    height: Math.max(1, Math.abs(mark.close - mark.open)),
    width: mark.width,
    x: mark.x - mark.width / 2,
    y: Math.min(mark.open, mark.close),
  };
  if (mark.hollow) {
    ctx.fillStyle = theme.background;
    ctx.fillRect(body.x, body.y, body.width, body.height);
    ctx.strokeRect(
      body.x + half,
      body.y + half,
      Math.max(0, body.width - 1),
      Math.max(0, body.height - 1),
    );
  } else {
    ctx.fillRect(body.x, body.y, body.width, body.height);
  }
}

/** A candle's wick, or an OHLC bar's line, from its high to its low, as a new path. */
function wick(ctx: CanvasRenderingContext2D, mark: CandleMark, x: number): void {
  ctx.beginPath();
  ctx.moveTo(x, mark.high);
  ctx.lineTo(x, mark.low);
}

/** Where a wick or an OHLC bar's line goes across, and how wide it strokes: a wick is a hairline on device pixels. */
function wickLine(
  mark: CandleMark,
  ratio: number,
): { readonly at: number; readonly width: number } {
  return mark.bars ? { at: Math.round(mark.x) + half, width: barsWidth } : hairline(mark.x, ratio);
}

function paintCandle(painting: Painting, mark: CandleMark): void {
  const { ctx } = painting;
  const { at: x, width } = wickLine(mark, painting.ratio);
  style(ctx, { fillStyle: mark.color, lineWidth: width, strokeStyle: mark.color });
  wick(ctx, mark, x);
  if (mark.bars) {
    paintTicks(painting, mark, x);
    return;
  }
  ctx.stroke();
  paintBody(painting, mark);
}

export { paintCandle };
