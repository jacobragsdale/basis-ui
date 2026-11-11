/* What makes every canvas read its tokens again: the page watcher counts a change for each thing that may have changed
 * them, and for nothing else, since each count repaints every canvas on the page. */

import { themeChangeEvent } from "@basis/ui";
import { afterEach, expect, test } from "vite-plus/test";

import { pageWatcher } from "#theme/page.ts";

/** Runs `change`, then waits for the mutation observers, and says how many changes the watcher counted. */
async function counted(change: () => void): Promise<number> {
  const watcher = pageWatcher(document);
  let calls = 0;
  const stop = watcher.subscribe(() => {
    calls += 1;
  });
  try {
    change();
    // Mutation observers report in a microtask, before a task the test waits for.
    const { promise, resolve } = Promise.withResolvers<undefined>();
    setTimeout(resolve, 0);
    await promise;
    return calls;
  } finally {
    stop();
  }
}

const wrapper = document.createElement("div");
document.body.append(wrapper);
const inner = document.createElement("div");
wrapper.append(inner);

afterEach(() => {
  delete wrapper.dataset["theme"];
  delete inner.dataset["density"];
  inner.className = "";
});

test(`counts ${themeChangeEvent} on the document, which code that changes tokens some other way dispatches`, async () => {
  expect(
    await counted(() => {
      document.dispatchEvent(new Event(themeChangeEvent));
    }),
  ).toBe(1);
});

test("counts a theme or a density shown on an element below the body, as on a wrapper", async () => {
  expect(
    await counted(() => {
      wrapper.dataset["theme"] = "sea";
    }),
  ).toBe(1);
  expect(
    await counted(() => {
      inner.dataset["density"] = "comfortable";
    }),
  ).toBe(1);
});

test("counts a class below the body only when it gains or loses dark", async () => {
  expect(
    await counted(() => {
      inner.className = "flex gap-2";
    }),
  ).toBe(0);
  expect(
    await counted(() => {
      inner.className = "flex gap-2 dark";
    }),
  ).toBe(1);
  expect(
    await counted(() => {
      inner.className = "dark";
    }),
  ).toBe(0);
});

test("counts a stylesheet added to the head, as a swapped theme is", async () => {
  const style = document.createElement("style");
  expect(
    await counted(() => {
      document.head.append(style);
    }),
  ).toBe(1);
  style.remove();
});
