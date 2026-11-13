/* What the components of one page share of a dataset, on the real engine: one load and one reload for the same data,
 * an error both show when two give one name different data, a fresh load when another page brings other data under
 * the same name, and a load nobody waits for any more cancelled. */

import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { liftedLimitsKey } from "#engine/limits.ts";
import type { WorkerPort } from "#engine/port.ts";
import { ParallaxProvider } from "#react/provider.tsx";
import { useDataset } from "#react/use-dataset.ts";
import type { DatasetSource } from "#react/use-dataset.ts";

import { countedBytes, positionsBytes, startWorker } from "./data.ts";

afterEach(() => {
  Reflect.deleteProperty(globalThis, liftedLimitsKey);
  vi.restoreAllMocks();
});

/** A dataset's status, rows and error, as text, under `label`, with a button that reloads it. */
function Shown({
  label,
  name = "positions",
  source,
  primaryKey,
}: {
  readonly label: string;
  readonly name?: string;
  readonly source: DatasetSource | null;
  readonly primaryKey?: string;
}): ReactNode {
  const { status, rows, error, reload } = useDataset(
    name,
    source,
    primaryKey === undefined ? {} : { primaryKey },
  );
  return (
    <section>
      <output aria-label={label}>{[status, rows ?? "", error ?? ""].join(" ").trim()}</output>
      <button type="button" aria-label={`reload ${label}`} onClick={reload}>
        Reload
      </button>
    </section>
  );
}

/** A worker that records the datasets the page loads and unloads, in order. */
function recordingWorker(): { readonly start: () => WorkerPort; readonly posted: string[] } {
  const posted: string[] = [];
  return {
    posted,
    start: (): WorkerPort => {
      const worker = startWorker();
      return {
        addEventListener: (type, listener): void => {
          worker.addEventListener(type, listener);
        },
        postMessage: (message, options): void => {
          if (message.kind === "load" || message.kind === "unload") {
            posted.push(`${message.kind} ${message.dataset}`);
          }
          worker.postMessage(message, options);
        },
        terminate: (): void => {
          worker.terminate();
        },
      };
    },
  };
}

const firstPositions = (): ArrayBuffer => positionsBytes();
const otherPositions = (): ArrayBuffer => positionsBytes();

/** The positions from two sources, the second only while `both`. */
function twoSources(both: boolean): ReactNode {
  return (
    <ParallaxProvider worker={startWorker}>
      <Shown label="first" source={firstPositions} />
      {both ? <Shown label="second" source={otherPositions} /> : null}
    </ParallaxProvider>
  );
}

const conflicting = /^failed .*"positions".*name/u;

describe("two components that give one name different data", () => {
  test("both fail, saying to put what tells them apart in the name, until one goes", async () => {
    const screen = await render(twoSources(true));
    await expect
      .element(screen.getByLabelText("first", { exact: true }))
      .toMatchTextContent(conflicting);
    await expect
      .element(screen.getByLabelText("second", { exact: true }))
      .toMatchTextContent(conflicting);
    await screen.rerender(twoSources(false));
    await expect
      .element(screen.getByLabelText("first", { exact: true }))
      .toHaveTextContent("loaded 6");
  });

  test("load afresh, not as a reload, when the page that showed the name goes and another brings other data", async () => {
    const { start, posted } = recordingWorker();
    const page = (which: "first" | "second"): ReactNode => (
      <ParallaxProvider worker={start}>
        {which === "first" ? (
          <Shown key="first" label="first" source={firstPositions} />
        ) : (
          <Shown key="second" label="second" source={() => countedBytes(3)} primaryKey="value" />
        )}
      </ParallaxProvider>
    );
    const screen = await render(page("first"));
    await expect
      .element(screen.getByLabelText("first", { exact: true }))
      .toHaveTextContent("loaded 6");
    await screen.rerender(page("second"));
    await expect
      .element(screen.getByLabelText("second", { exact: true }))
      .toHaveTextContent("loaded 3");
    expect(posted).toStrictEqual(["load positions", "unload positions", "load positions"]);
  });
});

describe("components that show the same data", () => {
  test("reload it together when one asks", async () => {
    let calls = 0;
    const shrinking = (): ArrayBuffer => {
      calls += 1;
      return countedBytes(calls === 1 ? 6 : 3);
    };
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Shown label="card" source={shrinking} />
        <Shown label="drawer" source={shrinking} />
      </ParallaxProvider>,
    );
    await expect
      .element(screen.getByLabelText("drawer", { exact: true }))
      .toHaveTextContent("loaded 6");
    await screen.getByLabelText("reload card").click();
    await expect
      .element(screen.getByLabelText("drawer", { exact: true }))
      .toHaveTextContent("loaded 3");
    await expect
      .element(screen.getByLabelText("card", { exact: true }))
      .toHaveTextContent("loaded 3");
    expect(calls).toBe(2);
  });
});

/** The positions from `source`, or none. */
function sourced(source: DatasetSource | null): ReactNode {
  return (
    <ParallaxProvider worker={startWorker}>
      {source === null ? null : <Shown label="positions" source={source} />}
    </ParallaxProvider>
  );
}

describe("a load nobody waits for", () => {
  test("is cancelled through the signal its source was given, when superseded or unmounted", async () => {
    const signals: AbortSignal[] = [];
    const never = async ({ signal }: { readonly signal: AbortSignal }): Promise<ArrayBuffer> => {
      signals.push(signal);
      return Promise.withResolvers<ArrayBuffer>().promise;
    };
    const neverAgain = async (context: { readonly signal: AbortSignal }): Promise<ArrayBuffer> =>
      never(context);
    const screen = await render(sourced(never));
    await screen.rerender(sourced(neverAgain));
    await vi.waitFor(() => {
      expect(signals.map((signal) => signal.aborted)).toStrictEqual([true, false]);
    });
    await screen.rerender(sourced(null));
    await vi.waitFor(() => {
      expect(signals.map((signal) => signal.aborted)).toStrictEqual([true, true]);
    });
  });
});

describe("bytes the app holds", () => {
  test("are refused before they are copied when they are past the limit", async () => {
    Reflect.set(globalThis, liftedLimitsKey, { maxArrowBytes: 4, maxRows: 10 });
    const copies = vi.spyOn(globalThis, "structuredClone");
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Shown label="positions" source={new ArrayBuffer(8)} />
      </ParallaxProvider>,
    );
    await expect
      .element(screen.getByLabelText("positions", { exact: true }))
      .toMatchTextContent(/^failed .*more than the 4 a table/u);
    expect(copies).not.toHaveBeenCalled();
  });
});
