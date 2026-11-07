/* What a scene tells React, through the host React hands it in an effect. The scene's elements reach it earlier, through
 * callback refs, so the plot's first size and the first legend can come before there is a host to tell: the relay keeps
 * the last of each, and tells a host as soon as it is set. */

import type { LegendEntry } from "./model-types.ts";
import type { PlotSize } from "./scene-inputs.ts";
import type { SceneHost } from "./scene.ts";

/** The scene's host, and the last sizes and legend it was told, or would have been. */
class HostRelay {
  #host: SceneHost | null = null;
  #sizes: readonly [PlotSize, PlotSize] | null = null;
  #legend: readonly LegendEntry[] | null = null;

  /** The host, once React has set it. */
  public get host(): SceneHost | null {
    return this.#host;
  }

  /** Sets the host, and tells it the last sizes and legend at once. */
  public set(host: SceneHost): void {
    this.#host = host;
    if (this.#sizes !== null) {
      host.resized(...this.#sizes);
    }
    if (this.#legend !== null) {
      host.legend(this.#legend);
    }
  }

  /** The plot's size and the chart's own. */
  public resized(plot: PlotSize, outer: PlotSize): void {
    this.#sizes = [plot, outer];
    this.#host?.resized(plot, outer);
  }

  /** The legend's entries. */
  public legend(entries: readonly LegendEntry[]): void {
    this.#legend = entries;
    this.#host?.legend(entries);
  }
}

export { HostRelay };
