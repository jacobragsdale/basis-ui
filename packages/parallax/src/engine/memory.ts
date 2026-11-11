/* When the engine gives its memory back. WebAssembly's memory never shrinks, so the memory of a dataset the page
 * unloads goes back to the engine's allocator, for later loads, and the page itself only gets it back by ending the
 * worker. A worker whose memory has grown past `restartAboveBytes`, more than twice what its tables still take, is
 * replaced once nothing waits on it: a planned restart, after which the app loads what it still shows again. */

import type { Answered } from "./answers.ts";

/** How the engine decides to give memory back, which tests change. */
interface EngineOptions {
  /** The WebAssembly memory past which a worker holding less than half of it is replaced once idle: 1 GiB by
   * default. */
  readonly restartAboveBytes?: number;
}

/** What a dataset's unload left in the worker. */
interface Unloaded {
  readonly memoryBytes: number;
  readonly heldBytes: number;
  /** Whether the worker is to be replaced, to give its memory back. */
  readonly restarting: boolean;
}

/** 1 GiB. */
const defaultRestartAboveBytes = 1_073_741_824;

/** The reason views give while a planned restart replaces the worker. */
const plannedReason =
  "Parallax started its engine again to give back the memory of tables the page no longer shows; its data loads again.";

/** Whether a worker is to be replaced to give its memory back, and when it may be. */
class MemoryWatch {
  readonly #restartAboveBytes: number;
  #due = false;

  public constructor(options: EngineOptions) {
    this.#restartAboveBytes = options.restartAboveBytes ?? defaultRestartAboveBytes;
  }

  /** Reads what an unload left, deciding whether to replace the worker. */
  public unloaded(answer: Answered): Unloaded {
    if (answer.kind !== "unloaded") {
      throw new Error("The parallax worker answered an unload with something else.");
    }
    const { memoryBytes, heldBytes } = answer;
    const restarting = memoryBytes > this.#restartAboveBytes && heldBytes * 2 < memoryBytes;
    this.#due ||= restarting;
    return { heldBytes, memoryBytes, restarting };
  }

  /** Whether to replace the worker now, which is idle: once only for each decision. */
  public restartNow(idle: boolean): boolean {
    const now = this.#due && idle;
    this.#due &&= !now;
    return now;
  }

  /** Forgets a decision, as when the worker is replaced anyway. */
  public reset(): void {
    this.#due = false;
  }
}

export { MemoryWatch, plannedReason };
export type { EngineOptions, Unloaded };
