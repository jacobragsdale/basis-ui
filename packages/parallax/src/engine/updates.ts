/* A view's layout updates. A grid's update carries the window to answer it with, which the engine always answers; at
 * most one such update is in flight and only the newest waits, so typing faster than the engine answers never queues a
 * backlog. Expansions asked for while an update waits are sent after it, so that they apply to its layout. The view
 * remembers its recent layouts, so a frame's own layout can be read.
 *
 * Frames of a layout older than the newest the engine has, or will have, are stale. An update the engine refuses
 * leaves it on the layout before, so a refused update no longer counts: the frames of the layout before draw again. */

import type { Viewport } from "./view-types.ts";

/** A layout update not yet sent: the layout, the window to answer it with when it goes, and when it was asked for. */
interface PendingUpdate {
  readonly layoutJson: string;
  readonly window: (() => Viewport | null) | null;
  readonly askedAtMs: number;
}

/** An update as it is sent: its configuration version, and the window read for it, if any. */
interface SentUpdate {
  readonly configVersion: bigint;
  readonly layoutJson: string;
  readonly viewport: Viewport | null;
}

/** An expansion or collapse of the group at a path, as JSON. */
interface Expansion {
  readonly pathJson: string;
  readonly expanded: boolean;
}

/** How many recent layouts a view remembers. */
const layoutsKept = 8n;
/** The configuration version a view opens with. */
const openingVersion = 0n;

/** The layout change still waiting for its first frame, and when it was asked for. */
interface Change {
  readonly configVersion: bigint;
  readonly sentAtMs: number;
}

/** A view's layout updates, in order. */
class LayoutUpdates {
  /** The configuration version last sent. */
  #configVersion = openingVersion;
  /** The newest configuration version the engine is known to have taken: by a frame of it, or by opening on it. */
  #accepted = openingVersion;
  /** The updates sent and not yet answered, by request id: their configuration versions. */
  readonly #unanswered = new Map<bigint, bigint>();
  #change: Change | null = null;
  /** The update with a window that the engine has not answered yet. */
  #inFlight: { readonly configVersion: bigint; readonly requestId: bigint } | null = null;
  /** The newest update asked for while another was in flight. */
  #pending: PendingUpdate | null = null;
  #held: Expansion[] = [];
  #latest = "";
  readonly #layouts = new Map<bigint, string>();

  /** The configuration version the engine has or will have, once the updates sent are answered: the newest sent that
   * it has not refused. Frames of older ones are dropped. */
  public get configVersion(): bigint {
    let newest = this.#accepted;
    for (const version of this.#unanswered.values()) {
      newest = version > newest ? version : newest;
    }
    return newest;
  }

  /** Whether an update waits behind the one in flight, which holds back viewports, chart windows and expansions. */
  public get waiting(): boolean {
    return this.#pending !== null;
  }

  /** The newest layout the view was given, whether sent yet or waiting. */
  public get latest(): string {
    return this.#latest;
  }

  /** Records the layout the view opens with. */
  public opened(layoutJson: string): void {
    this.#latest = layoutJson;
    this.#layouts.set(openingVersion, layoutJson);
  }

  /** The layout of configuration version `configVersion`, if it is still remembered. */
  public layoutAt(configVersion: bigint): string | undefined {
    return this.#layouts.get(configVersion);
  }

  /** Asks for an update, returning it to send now, or null when it waits behind the one in flight. */
  public ask(layoutJson: string, window: (() => Viewport | null) | null): PendingUpdate | null {
    this.#latest = layoutJson;
    const update: PendingUpdate = { askedAtMs: performance.now(), layoutJson, window };
    if (this.#inFlight !== null) {
      this.#pending = update;
      return null;
    }
    return update;
  }

  /** Starts sending an update: the next configuration version, remembered, and the window read for it now. */
  public begin(update: PendingUpdate): SentUpdate {
    this.#configVersion += 1n;
    const configVersion = this.#configVersion;
    this.#layouts.set(configVersion, update.layoutJson);
    // Frames older than the last few layouts are dropped anyway.
    for (const version of this.#layouts.keys()) {
      if (version + layoutsKept <= configVersion) {
        this.#layouts.delete(version);
      }
    }
    // Timed from when it was asked for, so that time spent waiting behind the update in flight counts.
    this.#change = { configVersion, sentAtMs: update.askedAtMs };
    return { configVersion, layoutJson: update.layoutJson, viewport: update.window?.() ?? null };
  }

  /** Records that an update went as request `requestId`; one `windowed`, with a window, makes later updates wait for
   * its answer. */
  public sent(configVersion: bigint, requestId: bigint, windowed: boolean): void {
    this.#unanswered.set(requestId, configVersion);
    if (windowed) {
      this.#inFlight = { configVersion, requestId };
    }
  }

  /** Holds an expansion while an update waits, returning false when it may go now. */
  public hold(expansion: Expansion): boolean {
    if (this.#pending === null) {
      return false;
    }
    this.#held = [...this.#held, expansion];
    return true;
  }

  /** The expansions held behind the update just sent, which go after it. */
  public release(): readonly Expansion[] {
    const held = this.#held;
    this.#held = [];
    return held;
  }

  /** Releases the update in flight once a frame of its layout or a newer one arrives, returning the update waiting,
   * which goes next. */
  public answered(configVersion: bigint): PendingUpdate | null {
    this.#accepted = configVersion > this.#accepted ? configVersion : this.#accepted;
    for (const [requestId, version] of this.#unanswered) {
      if (version <= configVersion) {
        this.#unanswered.delete(requestId);
      }
    }
    if (this.#inFlight !== null && configVersion >= this.#inFlight.configVersion) {
      return this.#next();
    }
    return null;
  }

  /** Forgets an update the engine refused as request `requestId`, which left it on the layout before, and releases it
   * if it was in flight, returning the update waiting. */
  public refused(requestId: bigint): PendingUpdate | null {
    this.#unanswered.delete(requestId);
    return this.#inFlight?.requestId === requestId ? this.#next() : null;
  }

  /** When the layout change a frame of `configVersion` answers was asked for, the first time one does. */
  public changedAt(configVersion: bigint): number | undefined {
    if (this.#change === null || configVersion < this.#change.configVersion) {
      return undefined;
    }
    const { sentAtMs } = this.#change;
    this.#change = null;
    return sentAtMs;
  }

  /** Forgets every update in flight or waiting, as when the view closes. */
  public clear(): void {
    this.#unanswered.clear();
    this.#inFlight = null;
    this.#pending = null;
    this.#held = [];
  }

  #next(): PendingUpdate | null {
    this.#inFlight = null;
    const next = this.#pending;
    this.#pending = null;
    return next;
  }
}

export { LayoutUpdates };
export type { Expansion, PendingUpdate };
