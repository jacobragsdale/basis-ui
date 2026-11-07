import { create, toBinary } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserEngine, EXPORT_TYPES, MAX_ARROW_BYTES, MAX_ROWS, MAX_XLSX_CELLS } from "./browser-engine";
import type { WorkerPort } from "./browser-engine";
import { ServerMessageSchema } from "./proto/parallax_pb";

/** A worker that records what the page posts and lets the test answer. */
class FakeWorker implements WorkerPort {
  public readonly posted: unknown[] = [];
  /** What each message's transfer list moved, by the message's place in `posted`. */
  public readonly transferred: (readonly Transferable[])[] = [];
  public terminated = false;
  private readonly listeners = new Map<string, (event: Event) => void>();

  public readonly postMessage = (message: unknown, options?: StructuredSerializeOptions): void => {
    this.posted.push(message);
    this.transferred.push(options?.transfer ?? []);
  };

  public readonly addEventListener = (type: string, listener: (event: Event) => void): void => {
    this.listeners.set(type, listener);
  };

  public readonly terminate = (): void => {
    this.terminated = true;
  };

  public answer(data: unknown): void {
    this.listeners.get("message")?.(new MessageEvent("message", { data }));
  }

  /** Fires the event a worker fires when its script fails to load or run. */
  public crash(message: string): void {
    this.listeners.get("error")?.(new ErrorEvent("error", { message }));
  }

  /** The messages of one kind posted so far. */
  public sent(kind: string): Record<string, unknown>[] {
    return this.posted.flatMap((m) => (typeof m === "object" && m !== null && "kind" in m && m.kind === kind ? [m as Record<string, unknown>] : []));
  }

  /** The ids of the requests of one kind posted so far. */
  public ids(kind: string): unknown[] {
    return this.sent(kind).map((m) => m["id"]);
  }
}

/** Starts fake workers, keeping each, so that a test can reach the one that replaced a trapped worker. */
class FakeWorkers {
  public readonly all: FakeWorker[] = [];

  public readonly start = (): FakeWorker => {
    const worker = new FakeWorker();
    this.all.push(worker);
    return worker;
  };

  public get current(): FakeWorker {
    const worker = this.all.at(-1);
    if (worker === undefined) {
      throw new Error("no worker started");
    }
    return worker;
  }
}

function engineWithWorker(): { readonly engine: BrowserEngine; readonly worker: FakeWorker; readonly workers: FakeWorkers } {
  const workers = new FakeWorkers();
  const engine = new BrowserEngine(workers.start);
  return { engine, worker: workers.current, workers };
}

/** Text's UTF-8 bytes, in the page's own Uint8Array, as the worker's messages arrive. */
function bytesOf(text: string): Uint8Array {
  return Uint8Array.from(new TextEncoder().encode(text));
}

function welcome(names: readonly string[]): Uint8Array {
  return toBinary(ServerMessageSchema, create(ServerMessageSchema, { body: { case: "welcome", value: { protocolVersion: 1, datasets: names.map((name) => ({ name })) } } }));
}

/** Opens a view and returns the errors it reports. */
function openView(engine: BrowserEngine, dataset: string): string[] {
  const errors: string[] = [];
  engine.connection.open(dataset, "{}", {
    frame: () => undefined,
    error: (m) => {
      errors.push(m);
    }
  });
  return errors;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("BrowserEngine copies", () => {
  it("loads each table once and forwards protocol messages both ways", async () => {
    const { engine, worker } = engineWithWorker();
    expect(engine.connection.location).toBe("browser");
    // The connection says hello through the worker.
    expect(worker.posted[0]).toMatchObject({ kind: "message" });
    const first = engine.copy("positions", { b: "2", a: "1" }, "/copy/positions?a=1&b=2");
    const again = engine.copy("positions", { a: "1", b: "2" }, "/copy/positions?a=1&b=2");
    expect(worker.ids("copy")).toEqual([1]);
    expect(worker.posted[1]).toEqual({ kind: "copy", id: 1, dataset: "positions", parameters: { b: "2", a: "1" }, url: "/copy/positions?a=1&b=2" });
    worker.answer({ kind: "copied", id: 1, rows: 10 });
    await expect(first).resolves.toBeUndefined();
    await expect(again).resolves.toBeUndefined();
    worker.answer({ kind: "reply", bytes: welcome(["positions"]) });
    await expect(engine.connection.dataset("positions")).resolves.toMatchObject({ name: "positions" });
  });

  it("forgets a failed copy so that a later view tries again", async () => {
    const { engine, worker } = engineWithWorker();
    const failed = engine.copy("positions", {}, "/copy/positions");
    worker.answer({ kind: "failed", id: 1, message: "the server answered 503" });
    await expect(failed).rejects.toThrow("503");
    const retried = engine.copy("positions", {}, "/copy/positions");
    expect(worker.ids("copy")).toEqual([1, 2]);
    worker.answer({ kind: "copied", id: 2, rows: 1 });
    await expect(retried).resolves.toBeUndefined();
  });

  it("stops on a fatal error or a message it does not know, failing every copy and view", async () => {
    for (const bad of [
      { kind: "fatal", message: "the parallax engine did not start" },
      { kind: "reply", bytes: "not bytes" }
    ]) {
      const { engine, worker, workers } = engineWithWorker();
      const errors = openView(engine, "positions");
      const pending = engine.copy("positions", {}, "/copy/positions");
      worker.answer(bad);
      await expect(pending).rejects.toThrow();
      await expect(engine.copy("trades", {}, "/copy/trades")).rejects.toThrow();
      await expect(engine.load("trades", new ArrayBuffer(8))).rejects.toThrow();
      expect(errors.length).toBe(1);
      // The worker ends, releasing the copies it held, and is not replaced: it would fail again.
      expect(worker.terminated).toBe(true);
      expect(workers.all.length).toBe(1);
    }
  });

  it("fails every copy when the worker script does not start", async () => {
    const { engine, worker } = engineWithWorker();
    const pending = engine.copy("positions", {}, "/copy/positions");
    worker.crash("Failed to fetch a worker script");
    await expect(pending).rejects.toThrow(/did not start.*Failed to fetch a worker script/);
    expect(worker.terminated).toBe(true);
  });

  it("gives up on a copy that takes too long, and tells the worker to stop fetching it", async () => {
    vi.useFakeTimers();
    const { engine, worker } = engineWithWorker();
    const slow = engine.copy("positions", {}, "/copy/positions", 1_000);
    const outcome = expect(slow).rejects.toThrow("longer than 1 s");
    await vi.advanceTimersByTimeAsync(1_000);
    await outcome;
    expect(worker.posted).toContainEqual({ kind: "cancel", id: 1 });
    // A late answer for the abandoned copy changes nothing, and a later view tries again.
    worker.answer({ kind: "copied", id: 1, rows: 5 });
    void engine.copy("positions", {}, "/copy/positions", 1_000).catch(() => undefined);
    expect(worker.ids("copy")).toEqual([1, 2]);
  });
});

describe("BrowserEngine loads", () => {
  it("moves the app's bytes to the worker with the row limit, and answers with the rows", async () => {
    const { engine, worker } = engineWithWorker();
    const bytes = new ArrayBuffer(64);
    const loaded = engine.load("positions", bytes, { primaryKey: "id", receivedAtMicros: 5_000 });
    const [message] = worker.sent("load");
    expect(message).toEqual({ kind: "load", id: 1, dataset: "positions", bytes, primaryKey: "id", nowMicros: 5_000, sourceAsOfMicros: null, maxRows: MAX_ROWS });
    // The buffer is in the transfer list, so it moves rather than being copied.
    expect(worker.transferred[worker.posted.indexOf(message)]).toEqual([bytes]);
    worker.answer({ kind: "loaded", id: 1, rows: 1234 });
    await expect(loaded).resolves.toEqual({ dataset: "positions", rows: 1234 });
    await expect(engine.holds("positions")).resolves.toBe(true);
    await expect(engine.holds("trades")).resolves.toBe(false);
  });

  it("passes a source time the app gives, which wins over the stream's", () => {
    const { engine, worker } = engineWithWorker();
    void engine.load("positions", new ArrayBuffer(8), { sourceAsOfMicros: 900 }).catch(() => undefined);
    expect(worker.sent("load")[0]).toMatchObject({ sourceAsOfMicros: 900, primaryKey: null });
  });

  it("refuses bytes past the limit before posting them, naming the limit and the size", async () => {
    const { engine, worker } = engineWithWorker();
    const posted = worker.posted.length;
    const tooBig = new ArrayBuffer(MAX_ARROW_BYTES + 1);
    await expect(engine.load("positions", tooBig)).rejects.toThrow(
      "positions is 70000001 bytes of Arrow, more than the 70000000 a table in the browser holds; have its API filter or aggregate the data to fit"
    );
    expect(worker.posted.length).toBe(posted);
    // The buffer stays the app's.
    expect(tooBig.byteLength).toBe(MAX_ARROW_BYTES + 1);
    // At the limit, it goes.
    void engine.load("positions", new ArrayBuffer(MAX_ARROW_BYTES)).catch(() => undefined);
    expect(worker.sent("load").length).toBe(1);
  });

  it("reports the engine's refusal, such as too many rows, and keeps a table an earlier load left", async () => {
    const { engine, worker } = engineWithWorker();
    const refused = engine.load("positions", new ArrayBuffer(8));
    worker.answer({ kind: "failed", id: 1, message: "positions has 150001 rows, more than the 150000 a table in the browser holds" });
    await expect(refused).rejects.toThrow("150001 rows");
    await expect(engine.holds("positions")).resolves.toBe(false);
    void engine.load("positions", new ArrayBuffer(8)).catch(() => undefined);
    worker.answer({ kind: "loaded", id: 2, rows: 10 });
    await expect(engine.holds("positions")).resolves.toBe(true);
    const reload = engine.load("positions", new ArrayBuffer(8));
    worker.answer({ kind: "failed", id: 3, message: "too many rows" });
    await expect(reload).rejects.toThrow("too many rows");
    await expect(engine.holds("positions")).resolves.toBe(true);
  });

  it("places a view by a load still in flight, waiting for its answer and saying why it failed", async () => {
    const { engine, worker } = engineWithWorker();
    const loading = engine.load("positions", new ArrayBuffer(8));
    const placed = engine.holds("positions");
    worker.answer({ kind: "loaded", id: 1, rows: 3 });
    await loading;
    await expect(placed).resolves.toBe(true);
    const failing = engine.load("trades", new ArrayBuffer(8));
    const waiting = engine.holds("trades");
    worker.answer({ kind: "failed", id: 2, message: "trades: the stream ends inside a message" });
    await expect(failing).rejects.toThrow();
    await expect(waiting).rejects.toThrow("the stream ends inside a message");
  });
});

describe("BrowserEngine traps", () => {
  it("ends a trapped worker, fails everything waiting and every view with the reason, and starts afresh", async () => {
    const { engine, worker, workers } = engineWithWorker();
    const restarts: string[] = [];
    engine.onRestart((reason) => {
      restarts.push(reason);
    });
    void engine.load("small", new ArrayBuffer(8)).catch(() => undefined);
    worker.answer({ kind: "loaded", id: 1, rows: 1 });
    await engine.holds("small");
    const errors = openView(engine, "small");
    const before = engine.connection;
    const big = engine.load("big", new ArrayBuffer(8));
    const exporting = engine.export('{"version":1,"dataset":"small"}', "csv");
    worker.answer({ kind: "trapped", message: "RuntimeError: unreachable" });

    const reason =
      "The engine in this page stopped after a fatal error (RuntimeError: unreachable), most likely because it ran out of memory. It has started again without its tables: load the data again.";
    await expect(big).rejects.toThrow(reason);
    await expect(exporting).rejects.toThrow(reason);
    expect(errors).toEqual([reason]);
    expect(restarts).toEqual([reason]);
    expect(worker.terminated).toBe(true);
    // A new worker took its place, with a new connection that has said hello; the tables went with the old one.
    expect(workers.all.length).toBe(2);
    const fresh = workers.current;
    expect(engine.connection).not.toBe(before);
    expect(fresh.sent("message").length).toBe(1);
    await expect(engine.holds("small")).resolves.toBe(false);

    // The trapped worker is never heard from again.
    worker.answer({ kind: "loaded", id: 2, rows: 99 });
    worker.answer({ kind: "trapped", message: "RuntimeError: unreachable" });
    expect(workers.all.length).toBe(2);

    // A later load goes to the new worker and works.
    const again = engine.load("small", new ArrayBuffer(8));
    const [message] = fresh.sent("load");
    expect(message).toMatchObject({ dataset: "small" });
    fresh.answer({ kind: "loaded", id: message?.["id"], rows: 1 });
    await expect(again).resolves.toEqual({ dataset: "small", rows: 1 });
    await expect(engine.holds("small")).resolves.toBe(true);
  });
});

describe("BrowserEngine exports", () => {
  it("asks the worker for an xlsx within the cell cap, and returns its bytes as a file", async () => {
    const { engine, worker } = engineWithWorker();
    const file = engine.export('{"version":1,"dataset":"positions"}', "xlsx", 3n);
    expect(worker.sent("export")[0]).toEqual({ kind: "export", id: 1, format: "xlsx", layout: '{"version":1,"dataset":"positions"}', loadVersion: 3, maxCells: MAX_XLSX_CELLS });
    worker.answer({ kind: "exported", id: 1, bytes: bytesOf("PK workbook") });
    const blob = await file;
    expect(blob.type).toBe(EXPORT_TYPES.xlsx);
    expect(await blob.text()).toBe("PK workbook");
  });

  it("joins a CSV's chunks into one file as they arrive", async () => {
    const { engine, worker } = engineWithWorker();
    const file = engine.export('{"version":1,"dataset":"positions"}', "csv");
    expect(worker.sent("export")[0]).toMatchObject({ format: "csv", loadVersion: null });
    for (const chunk of ["id,fund\n", "1,A\n", "2,B\n"]) {
      worker.answer({ kind: "chunk", id: 1, bytes: bytesOf(chunk) });
    }
    worker.answer({ kind: "exported", id: 1, bytes: null });
    const blob = await file;
    expect(blob.type).toBe(EXPORT_TYPES.csv);
    expect(await blob.text()).toBe("id,fund\n1,A\n2,B\n");
  });

  it("passes the engine's refusal on, such as an xlsx past the cell cap", async () => {
    const { engine, worker } = engineWithWorker();
    const file = engine.export('{"version":1,"dataset":"positions"}', "xlsx");
    worker.answer({ kind: "failed", id: 1, message: "the view has 4000000 cells, more than the 1000000 an Excel export here holds; export it as CSV instead" });
    await expect(file).rejects.toThrow("export it as CSV instead");
  });
});
