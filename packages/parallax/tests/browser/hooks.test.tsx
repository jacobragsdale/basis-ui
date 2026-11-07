import { StrictMode } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-react";

import type { ViewHandle } from "#engine/view.ts";
import type { LayoutInput } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";

import { hugeBytes, positionsBytes, startCappedWorker, startWorker } from "./data.ts";
import { Pivot } from "./pivot.tsx";

const byDesk = {
  group_by: ["desk"],
  measures: [{ aggregate: "sum", column: "market_value" }],
} satisfies LayoutInput;

describe("useDataset and useView", () => {
  test("load a table the page fetched, open a pivot of it, and read its frame", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Pivot />
      </ParallaxProvider>,
    );
    await expect.element(screen.getByRole("listitem").first()).toHaveTextContent("Total: 652.75");
    expect(
      screen
        .getByRole("listitem")
        .elements()
        .map((item) => item.textContent),
    ).toStrictEqual(["Total: 652.75", "Atlas: 250.75", "Boreal: 402.00"]);
    await expect.element(screen.getByLabelText("positions")).toHaveTextContent("loaded");
    await expect.element(screen.getByLabelText("view")).toHaveTextContent("open");
  });

  test("copy bytes the app holds, so the app can still read them", async () => {
    const bytes = positionsBytes();
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Pivot positions={bytes} />
      </ParallaxProvider>,
    );
    await expect.element(screen.getByLabelText("positions")).toHaveTextContent("loaded");
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  test("update the open view in place when its layout changes", async () => {
    const handles = new Set<ViewHandle>();
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Pivot handles={handles} />
      </ParallaxProvider>,
    );
    await expect.element(screen.getByText("Atlas: 250.75")).toBeVisible();
    await screen.rerender(
      <ParallaxProvider worker={startWorker}>
        <Pivot handles={handles} layout={byDesk} />
      </ParallaxProvider>,
    );
    await expect.element(screen.getByText("Credit: 202.25")).toBeVisible();
    expect(handles.size).toBe(1);
  });

  test("work under StrictMode, whose effects run twice", async () => {
    const screen = await render(
      <StrictMode>
        <ParallaxProvider worker={startWorker}>
          <Pivot />
        </ParallaxProvider>
      </StrictMode>,
    );
    await expect.element(screen.getByText("Total: 652.75")).toBeVisible();
  });

  test("fail a view whose layout is not valid, saying why", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Pivot layout={{ formats: { market_value: { decimals: 31 } }, group_by: ["fund"] }} />
      </ParallaxProvider>,
    );
    await expect.element(screen.getByLabelText("view")).toHaveTextContent("failed");
    await expect.element(screen.getByLabelText("view error")).toMatchTextContent(/decimals/u);
  });

  test("fail a dataset the engine refuses, and its views, with the reason", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Pivot positions={new ArrayBuffer(8)} />
      </ParallaxProvider>,
    );
    await expect.element(screen.getByLabelText("positions")).toHaveTextContent("failed");
    await expect
      .element(screen.getByLabelText("view error"))
      .toMatchTextContent(/^positions did not load: /u);
  });
});

describe("ParallaxProvider's engine", () => {
  test("starts when prewarmed, before any data, and ends when the provider unmounts", async () => {
    const started: Worker[] = [];
    const start = (): Worker => {
      const worker = startWorker();
      started.push(worker);
      return worker;
    };
    const screen = await render(<ParallaxProvider worker={start} prewarm />);
    expect(started).toHaveLength(1);
    const [worker] = started;
    if (worker === undefined) {
      throw new Error("The provider started no worker.");
    }
    const terminate = vi.spyOn(worker, "terminate");
    await screen.unmount();
    expect(terminate).toHaveBeenCalledOnce();
  });
});

describe("the hooks, when the engine runs out of memory", () => {
  test("fail the load that ran it out, and load and reopen what was loaded before", async () => {
    const screen = await render(
      <ParallaxProvider worker={startCappedWorker}>
        <Pivot />
      </ParallaxProvider>,
    );
    await expect.element(screen.getByText("Total: 652.75")).toBeVisible();
    await screen.rerender(
      <ParallaxProvider worker={startCappedWorker}>
        <Pivot other={hugeBytes} />
      </ParallaxProvider>,
    );
    await expect.element(screen.getByLabelText("other")).toHaveTextContent("failed");
    await expect
      .element(screen.getByLabelText("other error"))
      .toMatchTextContent(/ran out of memory/u);
    // The positions loaded again on the new engine, and their view reopened on them.
    await expect.element(screen.getByLabelText("view")).toHaveTextContent("open");
    await expect.element(screen.getByText("Total: 652.75")).toBeVisible();
  });

  test("load the failed dataset again once the app gives it data that fits", async () => {
    const screen = await render(
      <ParallaxProvider worker={startCappedWorker}>
        <Pivot other={hugeBytes} />
      </ParallaxProvider>,
    );
    await expect.element(screen.getByLabelText("other")).toHaveTextContent("failed");
    await screen.rerender(
      <ParallaxProvider worker={startCappedWorker}>
        <Pivot other={positionsBytes} />
      </ParallaxProvider>,
    );
    await expect.element(screen.getByLabelText("other")).toHaveTextContent("loaded");
    await expect.element(screen.getByText("Total: 652.75")).toBeVisible();
  });
});
