import "#styles.css";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@basis/ui";
import type { ResizableLayout } from "@basis/ui";
import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { BlotterSplit } from "./resizable.tsx";
import { only, sizeOf } from "./test-helpers.ts";

/** A handle's value and range, as its ARIA attributes give them. */
function valuesOf(handle: Element): readonly (string | null)[] {
  return ["aria-valuenow", "aria-valuemin", "aria-valuemax"].map((name) =>
    handle.getAttribute(name),
  );
}

/** A panel's share of its group's width, in percent, rounded. */
function widthShare(root: ParentNode, id: string): number {
  const group = only(root, '[data-slot="resizable-panel-group"]');
  return Math.round((sizeOf(only(root, `#${id}`))[0] / sizeOf(group)[0]) * 100);
}

describe("Resizable", () => {
  test("a handle is a separator named by its aria-label, valued at the size of the panel before it", async () => {
    const screen = await render(<BlotterSplit />);
    const handle = screen.getByRole("separator", { name: "Resize the trade list" });
    await expect.element(handle).toHaveAttribute("aria-orientation", "vertical");
    await expect.element(handle).toHaveAttribute("aria-controls", "trades");
    expect(valuesOf(handle.element())).toStrictEqual(["40", "20", "70"]);
    expect(widthShare(screen.container, "trades")).toBe(40);
  });

  test("the left and right arrows move it by 5 points", async () => {
    const screen = await render(<BlotterSplit />);
    const handle = screen.getByRole("separator", { name: "Resize the trade list" });
    handle.element().focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(handle).toHaveAttribute("aria-valuenow", "45");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    await expect.element(handle).toHaveAttribute("aria-valuenow", "35");
    expect(widthShare(screen.container, "trades")).toBe(35);
  });

  test("Home and End move it to its minimum and maximum", async () => {
    const screen = await render(<BlotterSplit />);
    const handle = screen.getByRole("separator", { name: "Resize the trade list" });
    handle.element().focus();
    await userEvent.keyboard("{Home}");
    await expect.element(handle).toHaveAttribute("aria-valuenow", "20");
    await userEvent.keyboard("{End}");
    await expect.element(handle).toHaveAttribute("aria-valuenow", "70");
    expect(widthShare(screen.container, "trades")).toBe(70);
  });

  test("it stops at the panels' limits: the list's minimum and maximum, and the detail's minimum", async () => {
    const screen = await render(<BlotterSplit />);
    const handle = screen.getByRole("separator", { name: "Resize the trade list" });
    handle.element().focus();
    await userEvent.keyboard("{End}{ArrowRight}{ArrowRight}");
    await expect.element(handle).toHaveAttribute("aria-valuenow", "70");
    expect(widthShare(screen.container, "detail")).toBe(30);
    await userEvent.keyboard("{Home}{ArrowLeft}");
    await expect.element(handle).toHaveAttribute("aria-valuenow", "20");
  });

  test("between stacked panels, it is horizontal and moves with the up and down arrows only", async () => {
    const screen = await render(<BlotterSplit />);
    const handle = screen.getByRole("separator", { name: "Resize the ticket" });
    await expect.element(handle).toHaveAttribute("aria-orientation", "horizontal");
    expect(valuesOf(handle.element())).toStrictEqual(["60", "25", "80"]);
    handle.element().focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(handle).toHaveAttribute("aria-valuenow", "65");
    await userEvent.keyboard("{ArrowRight}{ArrowUp}{ArrowUp}");
    await expect.element(handle).toHaveAttribute("aria-valuenow", "55");
  });

  test("a pointer drag moves it, and stops at the limits", async () => {
    const changed = vi.fn<(layout: Readonly<Record<string, number>>) => void>();
    const screen = await render(<BlotterSplit onLayoutChanged={changed} />);
    const handle = screen.getByRole("separator", { name: "Resize the trade list" });
    const detail = only(screen.container, "#detail");
    // Past the detail's minimum, near the group's right edge.
    await userEvent.dragAndDrop(handle, detail, {
      targetPosition: { x: sizeOf(detail)[0] - 2, y: 10 },
    });
    await expect.element(handle).toHaveAttribute("aria-valuenow", "70");
    expect(changed).toHaveBeenLastCalledWith({ detail: 30, trades: 70 });
    // Past the list's minimum, near the group's left edge.
    await userEvent.dragAndDrop(handle, only(screen.container, "#trades"), {
      targetPosition: { x: 2, y: 10 },
    });
    await expect.element(handle).toHaveAttribute("aria-valuenow", "20");
    expect(changed).toHaveBeenLastCalledWith({ detail: 80, trades: 20 });
  });

  test("a key reports the new layout, by panel id, to onLayoutChanged", async () => {
    const changed = vi.fn<(layout: Readonly<Record<string, number>>) => void>();
    const screen = await render(<BlotterSplit onLayoutChanged={changed} />);
    screen.getByRole("separator", { name: "Resize the trade list" }).element().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(changed).toHaveBeenCalledExactlyOnceWith({ detail: 55, trades: 45 });
  });

  test("defaultLayout starts it from a stored layout", async () => {
    const screen = await render(<BlotterSplit defaultLayout={{ detail: 70, trades: 30 }} />);
    await expect
      .element(screen.getByRole("separator", { name: "Resize the trade list" }))
      .toHaveAttribute("aria-valuenow", "30");
  });

  test("disabled, it leaves the tab order and ignores the keys", async () => {
    const screen = await render(<BlotterSplit disabled />);
    const handle = screen.getByRole("separator", { name: "Resize the trade list" });
    await expect.element(handle).toHaveAttribute("aria-disabled", "true");
    await expect.element(handle).not.toHaveAttribute("tabindex");
  });

  test("for a mouse, its hit area is 4 px across, centred on the line, so a pane's scrollbar beside it stays the pane's", async () => {
    const screen = await render(<BlotterSplit />);
    const handle = screen.getByRole("separator", { name: "Resize the trade list" }).element();
    const line = handle.getBoundingClientRect();
    const middle = line.left + line.width / 2;
    const height = line.top + line.height / 4;
    const hits = [-3, -1, 1, 3].map(
      (offset) => document.elementFromPoint(middle + offset, height) === handle,
    );
    expect(hits).toStrictEqual([false, true, true, false]);
  });
});

/** What a chart beside its legend showed when a `release` drag let go, before the group took the new layout. */
interface AtRelease {
  readonly chart: number;
  readonly dragging: string | undefined;
  readonly moved: boolean;
}

/** A chart beside its legend in a `release` group, the chart at most 70 percent wide, recording each release. */
function ChartSplit({
  atRelease,
  onLayoutChanged,
}: {
  readonly atRelease: AtRelease[];
  readonly onLayoutChanged: (layout: ResizableLayout) => void;
}): ReactElement {
  return (
    <div className="h-40">
      <ResizablePanelGroup resizeOn="release" onLayoutChanged={onLayoutChanged}>
        <ResizablePanel id="chart" defaultSize={50} maxSize={70}>
          Chart
        </ResizablePanel>
        <ResizableHandle
          aria-label="Resize the chart"
          onPointerUp={(event) => {
            atRelease.push({
              chart: widthShare(document, "chart"),
              dragging: event.currentTarget.dataset["dragging"],
              moved: event.currentTarget.style.translate !== "",
            });
          }}
        />
        <ResizablePanel id="legend">Legend</ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

describe("Resizable with resizeOn release", () => {
  test("a drag moves only the line, and resizes the panels once, when it lets go", async () => {
    const changed = vi.fn<(layout: ResizableLayout) => void>();
    const atRelease: AtRelease[] = [];
    const screen = await render(<ChartSplit atRelease={atRelease} onLayoutChanged={changed} />);
    const handle = screen.getByRole("separator", { name: "Resize the chart" });
    const legend = only(screen.container, "#legend");
    await userEvent.dragAndDrop(handle, legend, {
      targetPosition: { x: sizeOf(legend)[0] - 2, y: 10 },
    });
    expect(atRelease).toStrictEqual([{ chart: 50, dragging: "", moved: true }]);
    await expect.element(handle).toHaveAttribute("aria-valuenow", "70");
    const { dataset, style } = only(screen.container, '[data-slot="resizable-handle"]');
    expect({
      chart: widthShare(screen.container, "chart"),
      dragging: dataset["dragging"],
      reported: changed.mock.calls,
      translate: style.translate,
    }).toStrictEqual({
      chart: 70,
      dragging: undefined,
      reported: [[{ chart: 70, legend: 30 }]],
      translate: "",
    });
  });

  test("the keys still resize at once", async () => {
    const changed = vi.fn<(layout: ResizableLayout) => void>();
    const screen = await render(<ChartSplit atRelease={[]} onLayoutChanged={changed} />);
    screen.getByRole("separator", { name: "Resize the chart" }).element().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(changed).toHaveBeenCalledExactlyOnceWith({ chart: 55, legend: 45 });
    expect(widthShare(screen.container, "chart")).toBe(55);
  });
});
