// @vitest-environment happy-dom
/* ParallaxProvider in the Node DOM that `BASIS_TEST_DOM=node` runs an app's route checks in: happy-dom has no Web
 * Worker and no `document.fonts`, so the provider starts no engine, its datasets wait as `loading` without calling
 * their sources, and nothing throws. */

import { act, createElement } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vite-plus/test";

import { Grid } from "#grid/grid.tsx";
import { ParallaxProvider } from "#react/provider.tsx";
import { useDataset } from "#react/use-dataset.ts";
import { useView } from "#react/use-view.ts";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

/** A dataset and a view of it, as text. */
function Shown({ source }: { readonly source: () => ArrayBuffer }): ReactNode {
  const positions = useDataset("positions", source);
  const view = useView(positions, { group_by: ["fund"] });
  return createElement(
    "section",
    null,
    createElement("output", null, `${positions.status} ${view.status}`),
    createElement(Grid, { dataset: positions }),
  );
}

test("mounts without a worker or the document's fonts, its datasets loading and their sources not called", async () => {
  expect([typeof Worker, Reflect.get(document, "fonts")]).toStrictEqual(["undefined", undefined]);
  const source = vi.fn(() => new ArrayBuffer(8));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(ParallaxProvider, { prewarm: true }, createElement(Shown, { source })),
    );
    await Promise.resolve();
  });
  expect([container.querySelector("output")?.textContent, source.mock.calls.length]).toStrictEqual([
    "loading opening",
    0,
  ]);
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
});
