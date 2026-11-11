/* The render matrix: every page, and every section shown alone as its screenshot shows it, open, renders in both modes
 * and both densities with no console error. Written with @basis/ui/testing, so it runs in Chromium (`vp test`) and in a
 * Node DOM (`vp run @basis/gallery#test-node`), as an app's tests do. */

import "#styles.css";

import { applyPreferences } from "@basis/ui";
import type { Density, ResolvedMode } from "@basis/ui";
import { act, cleanup, render } from "@basis/ui/testing";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { Gallery } from "./gallery.tsx";
import { expectedErrors } from "./manifest.ts";
import { pages } from "./pages.ts";
import type { GalleryPage } from "./pages.ts";

const modes: readonly ResolvedMode[] = ["light", "dark"];
const densities: readonly Density[] = ["comfortable", "compact"];

/** What the page logged as an error while a test ran, but for the errors a section logs on purpose. */
let logged: string[] = [];

beforeEach(() => {
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    const text = parts.map(String).join(" ");
    if (!expectedErrors.some((expected) => expected.test(text))) {
      logged.push(text);
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** `step` on each item in turn, each once the one before has finished: one page renders at a time. */
async function inTurn<TItem, TResult>(
  items: readonly TItem[],
  step: (item: TItem) => Promise<TResult>,
  done: readonly TResult[] = [],
): Promise<readonly TResult[]> {
  const item = items[done.length];
  if (item === undefined) {
    return done;
  }
  return inTurn(items, step, [...done, await step(item)]);
}

/** Lets the page's effects, timers and promises run, as a screenshot waits for it to settle. */
async function settle(): Promise<void> {
  await act(async () => {
    const { promise, resolve } = Promise.withResolvers<undefined>();
    setTimeout(resolve, 50);
    await promise;
  });
}

interface View {
  readonly page: GalleryPage;
  readonly mode: ResolvedMode;
  readonly density: Density;
  /** The section shown alone, or `null` for the whole page. */
  readonly section?: string | null;
}

/** Renders a page in a mode and density, whole or with one section alone, and returns the ids of the sections it
 * shows. */
async function shown({ page, mode, density, section = null }: View): Promise<string[]> {
  applyPreferences(
    document.documentElement,
    { density, mode, motion: "full", theme: "default" },
    false,
  );
  const query = new URLSearchParams({ density, mode, page: page.id });
  const { container } = render(
    <Gallery
      page={page}
      search={`?${query.toString()}`}
      mode={mode}
      density={density}
      theme="default"
      section={section}
    />,
  );
  await settle();
  const ids = [...container.ownerDocument.querySelectorAll<HTMLElement>("[data-shot]")].map(
    (element) => element.dataset["shot"] ?? "",
  );
  cleanup();
  await settle();
  return ids;
}

describe.each(pages)("$title", (page) => {
  test.each(modes.flatMap((mode) => densities.map((density) => [mode, density] as const)))(
    "every section renders, on the page and alone, in %s mode, %s, with no console error",
    async (mode, density) => {
      const sections = await shown({ density, mode, page });
      expect(sections.length, "the page's sections").toBeGreaterThan(0);
      const alone = await inTurn(sections, async (section) =>
        shown({ density, mode, page, section }),
      );
      expect(alone, "each section shown alone").toStrictEqual(sections.map((section) => [section]));
      expect(logged, "console errors").toStrictEqual([]);
    },
  );
});
