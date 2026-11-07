import { TestBed } from "@angular/core/testing";
import { create, toBinary } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ParallaxClient, copyUrlFor, exportUrlFor, httpBaseFor, placeView, provideParallax } from "./client";
import type { ParallaxConfig } from "./client";
import type { CopyingEngine } from "./client";
import { Connection } from "./connection";
import { ServerMessageSchema } from "./proto/parallax_pb";

describe("httpBaseFor", () => {
  it.each([
    ["ws://host:8791/ws", "http://host:8791"],
    ["wss://host/ws", "https://host"],
    ["wss://host", "https://host"],
    ["wss://host/ws/", "https://host"],
    ["wss://host/app/ws", "https://host/app"],
    ["wss://host/app/", "https://host/app"]
  ])("puts the HTTP base beside %s", (socket, expected) => {
    expect(httpBaseFor(socket)).toBe(expected);
  });
});

describe("endpoints", () => {
  it.each(["https://api.host/px", "https://api.host/px/"])("sit under the base %s", (base) => {
    expect(exportUrlFor(base)).toBe("https://api.host/px/export");
    expect(copyUrlFor(base, "positions", {})).toBe("https://api.host/px/copy/positions");
  });

  it("encode the dataset and its parameters", () => {
    expect(copyUrlFor("https://host/app", "eod prices", { as_of: "2026-11-02", fund: "A&B" })).toBe("https://host/app/copy/eod%20prices?as_of=2026-11-02&fund=A%26B");
  });
});

/** A server connection whose welcome lists `datasets`. */
function server(datasets: readonly { readonly name: string; readonly browser: boolean }[]): Connection {
  const c = new Connection({ send: () => undefined, close: () => undefined });
  c.receive(toBinary(ServerMessageSchema, create(ServerMessageSchema, { body: { case: "welcome", value: { protocolVersion: 1, datasets: [...datasets] } } })));
  return c;
}

function engine(copy: CopyingEngine["copy"]): CopyingEngine {
  return { connection: new Connection({ send: () => undefined, close: () => undefined }, "browser"), copy };
}

describe("placeView", () => {
  const datasets = [
    { name: "positions", browser: true },
    { name: "trades", browser: false }
  ];

  it("runs a dataset marked for the browser there, after loading its copy", async () => {
    const copied: string[] = [];
    const browser = engine((dataset, _, url) => {
      copied.push(`${dataset} ${url}`);
      return Promise.resolve();
    });
    const placed = await placeView(server(datasets), () => browser, "positions", {}, "/copy/positions");
    expect(placed.connection.location).toBe("browser");
    expect(placed.fallback).toBeNull();
    expect(placed.loaded).toBe(false);
    expect(copied).toEqual(["positions /copy/positions"]);
  });

  it("keeps other datasets, and every dataset without a worker, on the server", async () => {
    const browser = engine(() => Promise.reject(new Error("not called")));
    for (const [dataset, choose] of [
      ["trades", () => browser],
      ["unknown", () => browser],
      ["positions", () => null]
    ] as const) {
      const placed = await placeView(server(datasets), choose, dataset, {}, "/copy");
      expect(placed.connection.location).toBe("server");
      expect(placed.fallback).toBeNull();
    }
  });

  it("falls back to the server, saying why, when the copy fails", async () => {
    const browser = engine(() => Promise.reject(new Error("the server answered 403")));
    const placed = await placeView(server(datasets), () => browser, "positions", {}, "/copy/positions");
    expect(placed.connection.location).toBe("server");
    expect(placed.fallback).toContain("the server answered 403");
  });
});

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

describe("ParallaxClient with data the app loads", () => {
  afterEach(() => {
    StubWorker.started = [];
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("places views of a loaded dataset by the load's answer, never asking the server", async () => {
    vi.stubGlobal("Worker", StubWorker);
    const socket = vi.fn();
    vi.stubGlobal("WebSocket", socket);
    const parallax = client({ url: "/ws", worker: "/parallax/worker.js" });
    const loading = parallax.load("positions", new ArrayBuffer(16));
    const worker = StubWorker.started[0];
    // The worker's welcome lists no datasets: it was sent before the load.
    worker?.answer({ kind: "reply", bytes: toBinary(ServerMessageSchema, create(ServerMessageSchema, { body: { case: "welcome", value: { protocolVersion: 1, datasets: [] } } })) });
    const placing = parallax.connectionFor("positions", {});
    worker?.answer({ kind: "loaded", id: 1, rows: 2 });
    await expect(loading).resolves.toEqual({ dataset: "positions", rows: 2 });
    const placed = await placing;
    expect(placed.connection.location).toBe("browser");
    expect(placed.loaded).toBe(true);
    expect(placed.fallback).toBeNull();
    expect(socket).not.toHaveBeenCalled();
  });

  it("runs without a server, saying plainly when a dataset was never loaded", async () => {
    vi.stubGlobal("Worker", StubWorker);
    const parallax = client({ worker: "/parallax/worker.js" });
    await expect(parallax.connectionFor("positions", {})).rejects.toThrow("positions is not loaded in this page");
    void parallax.load("positions", new ArrayBuffer(16)).catch(() => undefined);
    StubWorker.started[0]?.answer({ kind: "loaded", id: 1, rows: 2 });
    await expect(parallax.connectionFor("positions", {})).resolves.toMatchObject({ loaded: true });
    await expect(parallax.connection()).rejects.toThrow("no server");
  });

  it("needs a worker to load into", async () => {
    const parallax = client({ url: "/ws" });
    await expect(parallax.load("positions", new ArrayBuffer(16))).rejects.toThrow("no worker");
  });
});
