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

/** A page showing dataset b, which loads from `later`, and a, while `shown`. */
function page(workers: AnsweredWorkers, later: DatasetSource, shown: boolean): ReactNode {
  return (
    <ParallaxProvider worker={workers.start}>
      {shown ? <Shown name="a" source={() => new ArrayBuffer(8)} /> : null}
      <Shown name="b" source={later} />
    </ParallaxProvider>
  );
}

describe("a planned restart", () => {
  test("loads a dataset whose load was under way again on the new engine", async () => {
    const workers = answeredWorkers();
    const { later, resolve } = deferred();
    const screen = await render(page(workers, later, true));
    await answer(workers, ["load", "a"], { kind: "loaded", rows: 1 });
    // The page stops showing a, whose unload leaves the engine's memory outgrown.
    await screen.rerender(page(workers, later, false));
    await answer(workers, ["unload", "a"], outgrown);
    resolve(new ArrayBuffer(8));
    await answer(workers, ["load", "b"], { kind: "loaded", rows: 2 });
    // Its answer leaves the engine idle, so it starts again, and b loads there.
    await vi.waitFor(() => {
      expect(workers.all).toHaveLength(2);
    });
    await answer(workers, ["load", "b"], { kind: "loaded", rows: 2 }).then(async () =>
      expect.element(screen.getByLabelText("b")).toHaveTextContent("loaded"),
    );
  });
});
