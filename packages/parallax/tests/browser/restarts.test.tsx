/* The hooks across a planned restart, which gives the engine's memory back once nothing waits on it: a dataset whose
 * load was under way loads again on the new engine, rather than failing as the load that ran it out of memory would.
 * The engine is a fake worker the test answers. */

import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { ParallaxProvider } from "#react/provider.tsx";
import { useDataset } from "#react/use-dataset.ts";
import type { DatasetSource } from "#react/use-dataset.ts";

import { answeredWorkers } from "./answered-workers.ts";
import type { AnsweredWorkers } from "./answered-workers.ts";

const gib = 1024 ** 3;

/** A dataset's status and error, as text. */
function Shown({
  name,
  source,
}: {
  readonly name: string;
  readonly source: DatasetSource;
}): ReactNode {
  const { status, error } = useDataset(name, source);
  return <output aria-label={name}>{`${status} ${error ?? ""}`.trim()}</output>;
}

/** The id of the newest request of `kind` for `dataset` the current worker was sent, once it is. */
async function sentTo(
  workers: AnsweredWorkers,
  kind: "load" | "unload",
  dataset: string,
): Promise<number> {
  return vi.waitFor(() => {
    const request = workers
      .current()
      .posted.findLast((message) => message.kind === kind && message.dataset === dataset);
    if (request === undefined || !("id" in request)) {
      throw new Error(`No ${kind} of ${dataset} yet, on worker ${String(workers.all.length)}.`);
    }
    return request.id;
  });
}

/** Answers the newest request of `kind` for `dataset` the current worker was sent, once it is. */
async function answer(
  workers: AnsweredWorkers,
  [kind, dataset]: readonly ["load" | "unload", string],
  fields: Record<string, unknown>,
): Promise<void> {
  const id = await sentTo(workers, kind, dataset);
  workers.current().answer({ id, ...fields });
}

const outgrown = { heldBytes: 0, kind: "unloaded", memoryBytes: 2 * gib };

/** A source whose bytes come when the test resolves them. */
function deferred(): {
  readonly later: () => Promise<ArrayBuffer>;
  readonly resolve: (bytes: ArrayBuffer) => void;
} {
  const { promise, resolve } = Promise.withResolvers<ArrayBuffer>();
  return { later: async () => promise, resolve };
}

/** What a page of the test shows: dataset b, which loads from `later`, `count` times, and a, while `shown`. */
interface Page {
  readonly workers: AnsweredWorkers;
  readonly later: DatasetSource;
  readonly shown: boolean;
  readonly count?: number;
}

function page({ workers, later, shown, count = 1 }: Page): ReactNode {
  return (
    <ParallaxProvider worker={workers.start}>
      {shown ? <Shown name="a" source={() => new ArrayBuffer(8)} /> : null}
      {Array.from({ length: count }, (_unused, index) => (
        <Shown key={index} name="b" source={later} />
      ))}
    </ParallaxProvider>
  );
}

/**
 * Shows a and b, whose fetch is on its way; stops showing a, whose unload leaves the engine's memory outgrown; then
 * lets b's bytes arrive. Its answer leaves the engine idle, so it starts again, and b loads there: the test answers
 * that load.
 */
async function restartedUnderB(): Promise<{
  readonly workers: AnsweredWorkers;
  readonly later: DatasetSource;
  readonly screen: Awaited<ReturnType<typeof render>>;
}> {
  const workers = answeredWorkers();
  const { later, resolve } = deferred();
  const screen = await render(page({ later, shown: true, workers }));
  await answer(workers, ["load", "a"], { kind: "loaded", rows: 1 });
  await screen.rerender(page({ later, shown: false, workers }));
  await answer(workers, ["unload", "a"], outgrown);
  resolve(new ArrayBuffer(8));
  await answer(workers, ["load", "b"], { kind: "loaded", rows: 2 });
  await vi.waitFor(async () => {
    expect(workers.all).toHaveLength(2);
    await answer(workers, ["load", "b"], { kind: "loaded", rows: 2 });
  });
  return { later, screen, workers };
}

describe("a planned restart", () => {
  test("loads a dataset whose load was under way again on the new engine", async () => {
    const { screen } = await restartedUnderB();
    await expect.element(screen.getByLabelText("b")).toHaveTextContent("loaded");
  });

  test("shares one load between a component shown before it and one shown after", async () => {
    const { later, screen, workers } = await restartedUnderB();
    // A second component of b, shown after the restart, takes the load the first one made.
    await screen.rerender(page({ count: 2, later, shown: false, workers }));
    await expect
      .poll(() =>
        screen
          .getByLabelText("b")
          .all()
          .map((shown) => shown.element().textContent),
      )
      .toStrictEqual(["loaded", "loaded"]);
    expect(workers.current().posted.filter((message) => message.kind === "load")).toHaveLength(1);
  });
});
