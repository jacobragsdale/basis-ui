/* What the performance overlay samples while it is open: frame intervals from `requestAnimationFrame`, long frames from
 * the Long Animation Frames API, the times of inputs that can change a layout, each grid's counters once a second, and
 * the tab's memory. While open it asks for a frame at every vsync to time them, which costs a little main-thread time
 * of its own. */

import type { DrawStats } from "#grid/paint/stats.ts";
import { useEffect, useState } from "react";

import { gridStats } from "./grid-stats.ts";
import { gridFigures, percentile } from "./performance-figures.ts";
import type { Figures, Memory } from "./performance-figures.ts";

/** How many recent frame intervals the figures cover, and how many recent inputs are kept. */
const frameCount = 240;
const inputCount = 200;
/** How far back long frames count, in milliseconds. */
const windowMs = 10_000;
const millisPerSecond = 1000;
const memoryEveryMs = 10_000;
const median = 50;
const ninetyFifth = 95;
const inputEvents = ["pointerup", "keydown", "input", "change"] as const;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

/** Chromium's JavaScript heap figure for the page, available at once. */
function heapMemory(): Memory | null {
  const heap: unknown = Reflect.get(performance, "memory");
  if (isRecord(heap) && typeof heap["usedJSHeapSize"] === "number") {
    return {
      bytes: heap["usedJSHeapSize"],
      scope: "JavaScript heap of the page, without workers or canvases",
    };
  }
  return null;
}

/**
 * The whole tab's memory, workers included, when the page is cross-origin isolated. The browser answers after its next
 * garbage collection, which can take many seconds; null if it cannot measure.
 */
async function tabMemory(): Promise<Memory | null> {
  const measure: unknown = Reflect.get(performance, "measureUserAgentSpecificMemory");
  if (!crossOriginIsolated || typeof measure !== "function") {
    return null;
  }
  const result: unknown = await Reflect.apply(measure, performance, []);
  return isRecord(result) && typeof result["bytes"] === "number"
    ? { bytes: result["bytes"], scope: "whole tab, workers included" }
    : null;
}

/** Keeps the newest `count` of `values`, `value` added. */
function push(values: number[], value: number, count: number): void {
  values.push(value);
  if (values.length > count) {
    values.shift();
  }
}

/** Times every frame while the tab is visible; a hidden tab draws nothing, so the gap spanning its absence is no
 * frame. Returns the stop. */
function timeFrames(intervals: number[]): () => void {
  let last: number | null = null;
  const forget = (): void => {
    last = null;
  };
  let handle = 0;
  const tick = (now: number): void => {
    if (last !== null && !document.hidden) {
      push(intervals, now - last, frameCount);
    }
    last = now;
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);
  document.addEventListener("visibilitychange", forget);
  return () => {
    cancelAnimationFrame(handle);
    document.removeEventListener("visibilitychange", forget);
  };
}

/** Records long frames and the time their long tasks ran past 50 ms each, as the API reports it. Returns the stop. */
function watchLongFrames(frames: { at: number; blocked: number }[]): () => void {
  if (!PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
    return () => {
      // Nothing was observed, so there is nothing to stop.
    };
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const blocking: unknown = Reflect.get(entry, "blockingDuration");
      frames.push({ at: entry.startTime, blocked: typeof blocking === "number" ? blocking : 0 });
    }
  });
  observer.observe({ buffered: false, type: "long-animation-frame" });
  return () => {
    observer.disconnect();
  };
}

/** Records the times of inputs that can change a layout, by their event times, on `performance.now()`'s clock. */
function watchInputs(inputs: number[]): () => void {
  const onInput = (event: Event): void => {
    push(inputs, event.timeStamp, inputCount);
  };
  for (const type of inputEvents) {
    document.addEventListener(type, onInput, { capture: true, passive: true });
  }
  return () => {
    for (const type of inputEvents) {
      document.removeEventListener(type, onInput, { capture: true });
    }
  };
}

/** The figures, sampled once a second from the counters these keep. Returns the stop. */
function sampleFigures(set: (figures: Figures) => void): () => void {
  const intervals: number[] = [];
  const longFrames: { at: number; blocked: number }[] = [];
  const inputs: number[] = [];
  // An idle grid draws nothing, so each grid's figure keeps the last second that drew.
  const previous = new Map<string, { readonly stats: DrawStats; readonly drawMs: number | null }>();
  const stops = [timeFrames(intervals), watchLongFrames(longFrames), watchInputs(inputs)];
  const timer = setInterval(() => {
    const since = performance.now() - windowMs;
    const recent = longFrames.filter((frame) => frame.at >= since);
    longFrames.splice(0, longFrames.length, ...recent);
    const all = gridStats();
    const grids = gridFigures(all, previous, inputs);
    for (const [index, { name, stats }] of all.entries()) {
      previous.set(name, { drawMs: grids[index]?.drawMsPerFrame ?? null, stats });
    }
    set({
      blockedMsPerSecond:
        recent.reduce((sum, frame) => sum + frame.blocked, 0) / (windowMs / millisPerSecond),
      frameP50: percentile(intervals, median),
      frameP95: percentile(intervals, ninetyFifth),
      grids,
      longFrames: recent.length,
    });
  }, millisPerSecond);
  return () => {
    clearInterval(timer);
    for (const stop of stops) {
      stop();
    }
  };
}

/** Measures the memory every ten seconds: the heap figure at once, and the whole tab's once the browser answers,
 * which replaces it from then on. Returns the stop. */
function sampleMemory(set: (memory: Memory | null) => void): () => void {
  let measuring = false;
  let precise = false;
  const measureTab = async (): Promise<void> => {
    measuring = true;
    try {
      const memory = await tabMemory();
      if (memory !== null) {
        precise = true;
        set(memory);
      }
    } finally {
      measuring = false;
    }
  };
  const measure = (): void => {
    if (!precise) {
      set(heapMemory());
    }
    if (!measuring) {
      // A browser that cannot measure the tab leaves the heap's figure.
      measureTab().catch(() => null);
    }
  };
  const timer = setInterval(measure, memoryEveryMs);
  queueMicrotask(measure);
  return () => {
    clearInterval(timer);
  };
}

/** The overlay's figures and the memory, while the component that calls this is shown. */
function usePerformance(): { readonly figures: Figures | null; readonly memory: Memory | null } {
  const [figures, setFigures] = useState<Figures | null>(null);
  const [memory, setMemory] = useState<Memory | null>(heapMemory);
  useEffect(() => sampleFigures(setFigures), []);
  useEffect(() => sampleMemory(setMemory), []);
  return { figures, memory };
}

export { usePerformance };
