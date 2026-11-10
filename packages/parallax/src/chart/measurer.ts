/* Text widths in a font, measured on a canvas of the chart's own and remembered, since a model measures every label
 * each time it is built. */

/** The most widths remembered before the cache starts again. */
const mostWidths = 10_000;
/** About how wide a character is, where no canvas can measure. */
const characterWidth = 7;

/** Measures text in a font, as the chart's canvas draws it. */
class TextMeasurer {
  readonly #context: CanvasRenderingContext2D | null;
  readonly #widths = new Map<string, number>();
  #loaded = true;

  public constructor(document: Document) {
    this.#context = document.createElement("canvas").getContext("2d");
  }

  /** The width of `text` in `font`, in CSS pixels. */
  public measure(text: string, font: string): number {
    const key = `${font}\u0000${text}`;
    const known = this.#widths.get(key);
    if (known !== undefined) {
      return known;
    }
    if (this.#context === null) {
      return text.length * characterWidth;
    }
    return this.#remember(key, this.#measured(text, font));
  }

  /** Takes whether the theme's font has loaded, forgetting every width when that changes: what was measured before
   * it loaded was the fallback's width. */
  public fontLoaded(loaded: boolean): void {
    if (loaded !== this.#loaded) {
      this.#loaded = loaded;
      this.#widths.clear();
    }
  }

  #measured(text: string, font: string): number {
    const context = this.#context;
    if (context === null) {
      return 0;
    }
    context.font = font;
    return context.measureText(text).width;
  }

  #remember(key: string, width: number): number {
    if (this.#widths.size > mostWidths) {
      this.#widths.clear();
    }
    this.#widths.set(key, width);
    return width;
  }
}

export { TextMeasurer };
