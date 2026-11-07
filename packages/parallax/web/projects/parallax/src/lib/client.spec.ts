import { TestBed } from "@angular/core/testing";
import { create, toBinary } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ParallaxClient, provideParallax } from "./client";
import type { ParallaxConfig } from "./client";
import { ServerMessageSchema } from "./proto/parallax_pb";

/** The page side of a worker: what the client posts, and a way to answer. */
class StubWorker {
  public static started: StubWorker[] = [];
  public readonly posted: unknown[] = [];
  private listener: ((event: Event) => void) | null = null;

  constructor() {
    StubWorker.started.push(this);
  }

  public postMessage(message: unknown): void {
    this.posted.push(message);
  }

  public addEventListener(type: string, listener: (event: Event) => void): void {
    if (type === "message") {
      this.listener = listener;
    }
  }

  public terminate(): void {
    this.listener = null;
  }

  public answer(data: unknown): void {
    this.listener?.(new MessageEvent("message", { data }));
  }
}

function client(config: ParallaxConfig): ParallaxClient {
  TestBed.configureTestingModule({ providers: [provideParallax(config)] });
  return TestBed.inject(ParallaxClient);
}

describe("ParallaxClient", () => {
  afterEach(() => {
    StubWorker.started = [];
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("places views of a loaded dataset by the load's answer, and opens no socket", async () => {
    vi.stubGlobal("Worker", StubWorker);
    const socket = vi.fn();
    vi.stubGlobal("WebSocket", socket);
    const parallax = client({ worker: "/parallax/worker.js" });
    const loading = parallax.load("positions", new ArrayBuffer(16));
    const worker = StubWorker.started[0];
    // The worker's welcome lists no datasets: it was sent before the load.
    worker?.answer({ kind: "reply", bytes: toBinary(ServerMessageSchema, create(ServerMessageSchema, { body: { case: "welcome", value: { protocolVersion: 1, datasets: [] } } })) });
    const placing = parallax.connectionFor("positions");
    worker?.answer({ kind: "loaded", id: 1, rows: 2 });
    await expect(loading).resolves.toEqual({ dataset: "positions", rows: 2 });
    await expect(placing).resolves.toBeDefined();
    expect(StubWorker.started.length).toBe(1);
    expect(socket).not.toHaveBeenCalled();
  });

  it("says plainly when a dataset was never loaded", async () => {
    vi.stubGlobal("Worker", StubWorker);
    const parallax = client({ worker: "/parallax/worker.js" });
    await expect(parallax.connectionFor("positions")).rejects.toThrow("positions is not loaded in this page");
    void parallax.load("positions", new ArrayBuffer(16)).catch(() => undefined);
    StubWorker.started[0]?.answer({ kind: "loaded", id: 1, rows: 2 });
    await expect(parallax.connectionFor("positions")).resolves.toBeDefined();
  });

  it("starts the worker when the application starts only if asked to", () => {
    vi.stubGlobal("Worker", StubWorker);
    client({ worker: "/parallax/worker.js" });
    expect(StubWorker.started.length).toBe(0);
    TestBed.resetTestingModule();
    client({ worker: "/parallax/worker.js", prewarm: true });
    expect(StubWorker.started.length).toBe(1);
  });
});
