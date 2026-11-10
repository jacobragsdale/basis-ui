/* A canvas in whole device pixels. At a ratio such as 1.25, Windows' 125 %, a size in CSS pixels is rarely a whole
 * number of device pixels: a canvas 531 CSS pixels tall covers 663.75, so a backing store of 664 is resampled into it
 * and every line and glyph blurs. So a canvas takes a CSS size that is whole device pixels, its backing store is the
 * size the browser says its box covers in device pixels, and what it draws lands on device pixels: rectangles have
 * their edges rounded to them, and a rule is a whole number of them thick. Text needs nothing: Chromium rounds a
 * glyph's baseline to a device pixel itself when the transform only scales. The grid, the pivot and
 * the charts all draw this way, and the step that copies a scrolled grid's rows rather than drawing them needs it. */

/** A canvas's size: its CSS size, which is whole device pixels at `ratio`, and its backing store's, in device pixels. */
interface DeviceSize {
  readonly ratio: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly width: number;
  readonly height: number;
}

/** A device pixel's slack for a product such as 345 × 1.15, which floating point makes 344.99999999999994. */
const slack = 1e-6;
/** The thickest a filled span is and still counts as a rule, drawn a whole number of device pixels thick, in CSS
 * pixels. Anything thicker has its two edges rounded to device pixels instead. */
const thickestRule = 2;

/** The device pixels of one CSS pixel in `view`: its `devicePixelRatio`, or 1 where it has none. */
function ratioOf(view: Window | null): number {
  const ratio = view?.devicePixelRatio ?? 1;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

/** The whole device pixels in `css` CSS pixels at `ratio`, at least 1. */
function wholeDevicePixels(css: number, ratio: number): number {
  return Math.max(1, Math.floor(css * ratio + slack));
}

/** The size a canvas filling an area of `width` by `height` CSS pixels takes at `ratio`: the whole device pixels
 * inside the area, and their CSS size, so that the canvas never overflows the area it fills. */
function deviceSize(width: number, height: number, ratio: number): DeviceSize {
  const [deviceWidth, deviceHeight] = [
    wholeDevicePixels(width, ratio),
    wholeDevicePixels(height, ratio),
  ];
  return {
    cssHeight: deviceHeight / ratio,
    cssWidth: deviceWidth / ratio,
    height: deviceHeight,
    ratio,
    width: deviceWidth,
  };
}

/** `value` CSS pixels moved to the nearest device pixel's edge, as a clip's edges are. */
function snap(value: number, ratio: number): number {
  return Math.round(value * ratio) / ratio;
}

/** How a filled span is placed on device pixels, `[start, size]` in CSS pixels. A wide one has its two edges rounded
 * to device pixels, so that neighbours tile without a gap or a seam. A rule, at most two CSS pixels thick, is a whole
 * number of device pixels thick, at least one, rounded down as a CSS border is, so that every rule is as thick as
 * every other; it hugs its span's end, as a cell's right and bottom borders do, or, with `start`, its start. */
function snapSpan(
  [start, size]: readonly [number, number],
  { ratio, anchor = "end" }: { readonly ratio: number; readonly anchor?: "start" | "end" },
): readonly [number, number] {
  const [from, length] = size < 0 ? [start + size, -size] : [start, size];
  if (length === 0 || length > thickestRule) {
    const [first, last] = [Math.round(from * ratio), Math.round((from + length) * ratio)];
    return [first / ratio, (last - first) / ratio];
  }
  const thick = Math.max(1, Math.floor(length * ratio + slack));
  const first =
    anchor === "start" ? Math.round(from * ratio) : Math.round((from + length) * ratio) - thick;
  return [first / ratio, thick / ratio];
}

/** A rectangle `[x, y, width, height]` in CSS pixels, placed on device pixels as `snapSpan` places each side. */
function snapRect(
  [x, y, width, height]: readonly [number, number, number, number],
  options: { readonly ratio: number; readonly anchor?: "start" | "end" },
): readonly [number, number, number, number] {
  const [left, across] = snapSpan([x, width], options);
  const [top, down] = snapSpan([y, height], options);
  return [left, top, across, down];
}

/** A stroked line one CSS pixel thick along `at`, placed on device pixels: where its middle goes and how wide it
 * strokes, so that it covers whole device pixels from the one `at` rounds to. At a ratio of 1 that is `round(at) +
 * 0.5`, one pixel wide. */
function hairline(at: number, ratio: number): { readonly at: number; readonly width: number } {
  const thick = Math.max(1, Math.floor(ratio + slack));
  return { at: (Math.round(at * ratio) + thick / 2) / ratio, width: thick / ratio };
}

/** What the browser says a canvas's box covers in device pixels, and the CSS size and ratio it said it for. */
interface Observed {
  readonly ratio: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly width: number;
  readonly height: number;
}

/** How near a CSS size the browser reports must be to the one set: layout keeps sizes to a 64th of a pixel. */
const layoutUnit = 0.015625;

/** Whether a box of `device` device pixels can cover `css` CSS pixels at `ratio`: rounding its position moves its
 * edges by a device pixel at most. */
function covers(device: number, css: number, ratio: number): boolean {
  return Math.abs(device - css * ratio) <= 1;
}

/**
 * The device-pixel box an entry reports, or null where the browser does not report one, or reports one that cannot be
 * the box at `ratio`. A ratio that is only emulated, as Playwright's `deviceScaleFactor` and DevTools' device mode
 * emulate one, changes `devicePixelRatio` but not the device pixels a box covers, so Chromium reports CSS pixels; the
 * canvas is then sized at the ratio it says, as where no box is reported.
 */
function observedOf(entry: ResizeObserverEntry, ratio: number): Observed | null {
  const device = entry.devicePixelContentBoxSize as readonly ResizeObserverSize[] | undefined;
  const [box, css] = [device?.[0], entry.contentBoxSize[0]];
  if (
    box === undefined ||
    css === undefined ||
    !covers(box.inlineSize, css.inlineSize, ratio) ||
    !covers(box.blockSize, css.blockSize, ratio)
  ) {
    return null;
  }
  return {
    cssHeight: css.blockSize,
    cssWidth: css.inlineSize,
    height: box.blockSize,
    ratio,
    width: box.inlineSize,
  };
}

/**
 * Keeps a canvas in whole device pixels: sizes it, follows the device-pixel box the browser reports for it, and calls
 * `changed` when that box or the ratio changes, so that its owner draws again.
 *
 * The backing store is the size `ResizeObserver`'s `devicePixelContentBoxSize` reports, which is what the browser
 * covers on the screen once it has rounded the canvas's position. Until it reports, and where it never does, as in
 * Safari, which has no `device-pixel-content-box`, the backing store is the CSS size times the ratio: the CSS size is
 * whole device pixels, so that is exact unless the canvas sits at a fraction of one. A change of ratio, such as a
 * window moved to another monitor or the page zoomed, is heard from `matchMedia` on the `resolution` the canvas was
 * sized at.
 */
class DevicePixels {
  /** The canvas it keeps in whole device pixels. */
  public readonly canvas: HTMLCanvasElement;
  readonly #changed: () => void;
  readonly #observer: ResizeObserver;
  #observed: Observed | null = null;
  /** The CSS size last set, as `widthxheight`. */
  #css = "";
  /** Stops listening for the ratio to change, or null when not listening. */
  #stopRatio: (() => void) | null = null;

  public constructor(canvas: HTMLCanvasElement, changed: () => void) {
    this.canvas = canvas;
    this.#changed = changed;
    this.#observer = new ResizeObserver((entries) => {
      this.#observe(entries);
    });
    try {
      this.#observer.observe(canvas, { box: "device-pixel-content-box" });
    } catch {
      // A browser without the box, such as Safari, refuses the option; the content box still says when it resizes.
      this.#observer.observe(canvas);
    }
    this.#listenRatio();
  }

  /** The device pixels of one CSS pixel, now. */
  public get ratio(): number {
    return ratioOf(this.canvas.ownerDocument.defaultView);
  }

  /**
   * Sizes the canvas to fill `width` by `height` CSS pixels in whole device pixels, and its backing store to the box
   * the browser reports for that size, if it has. Returns its size, and whether it changed, which clears the canvas.
   */
  public fit(width: number, height: number): DeviceSize & { readonly resized: boolean } {
    const { ratio } = this;
    const size = this.#reported(deviceSize(width, height, ratio));
    const { canvas } = this;
    this.#setCss(size);
    const resized = canvas.width !== size.width || canvas.height !== size.height;
    if (resized) {
      Object.assign(canvas, { height: size.height, width: size.width });
    }
    return { ...size, resized };
  }

  /** Sets the canvas's CSS size. The style reads back rounded, so the size last set is kept: setting it again on
   * every draw would lay the page out again. */
  #setCss({ cssWidth, cssHeight }: DeviceSize): void {
    const css = `${String(cssWidth)}x${String(cssHeight)}`;
    if (css !== this.#css) {
      this.#css = css;
      Object.assign(this.canvas.style, {
        height: `${String(cssHeight)}px`,
        width: `${String(cssWidth)}px`,
      });
    }
  }

  /** Stops following the canvas. */
  public dispose(): void {
    this.#observer.disconnect();
    this.#stopRatio?.();
  }

  /** `size`, its backing store the one the browser reported if it reported one for this CSS size and ratio. */
  #reported(size: DeviceSize): DeviceSize {
    const observed = this.#observed;
    const same =
      observed !== null &&
      observed.ratio === size.ratio &&
      Math.abs(observed.cssWidth - size.cssWidth) <= layoutUnit &&
      Math.abs(observed.cssHeight - size.cssHeight) <= layoutUnit;
    return same ? { ...size, height: observed.height, width: observed.width } : size;
  }

  /** Keeps the box the browser reports, and asks for a draw if the backing store is not that size. */
  #observe(entries: readonly ResizeObserverEntry[]): void {
    const entry = entries.at(-1);
    const observed = entry === undefined ? null : observedOf(entry, this.ratio);
    if (observed === null) {
      return;
    }
    this.#observed = observed;
    const { canvas } = this;
    if (canvas.width !== observed.width || canvas.height !== observed.height) {
      this.#changed();
    }
  }

  /** Listens for the ratio to change from the one now, then listens again at the new one. */
  #listenRatio(): void {
    const media = this.canvas.ownerDocument.defaultView?.matchMedia(
      `(resolution: ${String(this.ratio)}dppx)`,
    );
    if (media === undefined) {
      return;
    }
    const changed = (): void => {
      this.#stopRatio?.();
      this.#listenRatio();
      this.#changed();
    };
    media.addEventListener("change", changed);
    this.#stopRatio = (): void => {
      media.removeEventListener("change", changed);
    };
  }
}

export { DevicePixels, deviceSize, hairline, ratioOf, snap, snapRect, snapSpan, wholeDevicePixels };
export type { DeviceSize };
