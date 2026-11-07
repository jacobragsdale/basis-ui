import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { debounce, rafThrottle, sleep, throttle } from "#utils/index.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Calls a function at each of the given times, in ms from now, then runs the clock out, and returns what it ran with
 * and when, as `value@ms`. */
function timeline(
  make: (record: (value: number) => void) => (value: number) => void,
  callsAt: readonly number[],
): string[] {
  const start = Date.now();
  const ran: string[] = [];
  const call = make((value) => {
    ran.push(`${String(value)}@${String(Date.now() - start)}`);
  });
  for (const at of callsAt) {
    vi.advanceTimersByTime(at - (Date.now() - start));
    call(at);
  }
  vi.runAllTimers();
  return ran;
}

describe("debounce", () => {
  test("calls once calls stop, with the last arguments", () => {
    expect(timeline((record) => debounce(record, 100), [0, 50, 120, 300])).toEqual([
      "120@220",
      "300@400",
    ]);
  });

  test("calls at once on the leading edge, and again at the end only if called again", () => {
    expect(
      timeline((record) => debounce(record, 100, { edges: ["leading"] }), [0, 50, 300]),
    ).toEqual(["0@0", "300@300"]);
    expect(
      timeline((record) => debounce(record, 100, { edges: ["leading", "trailing"] }), [0, 50, 300]),
    ).toEqual(["0@0", "50@150", "300@300"]);
  });

  test("cancel drops the held call", () => {
    const record = vi.fn<(value: number) => void>();
    const debounced = debounce(record, 100);
    debounced(1);
    debounced.cancel();
    vi.runAllTimers();
    expect(record).not.toHaveBeenCalled();
  });

  test("flush runs the held call now, and only once", () => {
    const record = vi.fn<(value: number) => void>();
    const debounced = debounce(record, 100);
    debounced(2);
    debounced.flush();
    expect(record).toHaveBeenCalledExactlyOnceWith(2);
    vi.runAllTimers();
    expect(record).toHaveBeenCalledOnce();
  });

  test("an aborted signal cancels the held call and stops later ones", () => {
    const record = vi.fn<(value: number) => void>();
    const controller = new AbortController();
    const debounced = debounce(record, 100, { signal: controller.signal });
    debounced(1);
    controller.abort();
    debounced(2);
    vi.runAllTimers();
    expect(record).not.toHaveBeenCalled();
  });

  test("refuses no edges and a negative wait", () => {
    const ignore = vi.fn<() => void>();
    expect(() => debounce(ignore, 100, { edges: [] })).toThrow(RangeError);
    expect(() => debounce(ignore, -1)).toThrow(RangeError);
  });
});

describe("throttle", () => {
  test("calls at once, then with the latest arguments at the end of each wait", () => {
    expect(timeline((record) => throttle(record, 100), [0, 30, 60, 250])).toEqual([
      "0@0",
      "60@100",
      "250@250",
    ]);
  });

  test("never calls twice within the wait, even after a trailing call", () => {
    expect(timeline((record) => throttle(record, 100), [0, 50, 150])).toEqual([
      "0@0",
      "50@100",
      "150@200",
    ]);
  });

  test("on the leading edge only, drops the calls made during the wait", () => {
    expect(
      timeline((record) => throttle(record, 100, { edges: ["leading"] }), [0, 50, 150]),
    ).toEqual(["0@0", "150@150"]);
  });

  test("on the trailing edge only, waits before the first call", () => {
    expect(
      timeline((record) => throttle(record, 100, { edges: ["trailing"] }), [0, 50, 150]),
    ).toEqual(["50@100", "150@200"]);
  });

  test("flush runs the held call now, and the next call is a leading one", () => {
    const record = vi.fn<(value: number) => void>();
    const throttled = throttle(record, 100);
    throttled(1);
    throttled(2);
    throttled.flush();
    throttled(3);
    expect(record.mock.calls).toEqual([[1], [2], [3]]);
  });

  test("cancel drops the held call", () => {
    const record = vi.fn<(value: number) => void>();
    const throttled = throttle(record, 100);
    throttled(1);
    throttled(2);
    throttled.cancel();
    vi.runAllTimers();
    expect(record.mock.calls).toEqual([[1]]);
  });
});

/** Frames requested and not yet drawn, and the ids of frames cancelled. */
function stubFrames(): { readonly frames: FrameRequestCallback[]; readonly cancelled: number[] } {
  const frames: FrameRequestCallback[] = [];
  const cancelled: number[] = [];
  vi.stubGlobal("requestAnimationFrame", (draw: FrameRequestCallback) => frames.push(draw));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => cancelled.push(id));
  return { cancelled, frames };
}

describe("rafThrottle", () => {
  test("calls once a frame, with the latest arguments", () => {
    const { frames } = stubFrames();
    const record = vi.fn<(value: number) => void>();
    const throttled = rafThrottle(record);
    throttled(1);
    throttled(2);
    expect(frames).toHaveLength(1);
    frames.shift()?.(0);
    expect(record).toHaveBeenCalledExactlyOnceWith(2);
  });

  test("cancel drops the frame, and flush runs the held call now", () => {
    const { cancelled } = stubFrames();
    const record = vi.fn<(value: number) => void>();
    const throttled = rafThrottle(record);
    throttled(3);
    throttled.cancel();
    throttled(4);
    throttled.flush();
    expect(cancelled).toEqual([1, 2]);
    expect(record.mock.calls).toEqual([[4]]);
  });
});

describe("sleep", () => {
  test("resolves after the time", async () => {
    const slept = sleep(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(slept).resolves.toBeUndefined();
  });

  test("rejects with the signal's reason when it aborts, or has aborted", async () => {
    const controller = new AbortController();
    const slept = sleep(1000, controller.signal);
    controller.abort();
    await expect(slept).rejects.toMatchObject({ name: "AbortError" });
    const closed = AbortSignal.abort(new Error("Closed."));
    await expect(sleep(10, closed)).rejects.toThrow("Closed.");
  });
});
