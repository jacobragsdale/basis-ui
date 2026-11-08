import "#styles.css";

import { CellBar, QueryState, Sparkline } from "@basis/ui";
import type { QueryLike } from "@basis/ui";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { SmallChartsAndStates } from "./small-charts-and-states.tsx";

/** A colour as the browser computes it, so it compares with a computed style. */
function computedColour(value: string): string {
  const probe = document.createElement("div");
  probe.style.color = value;
  document.body.append(probe);
  const { color } = getComputedStyle(probe);
  probe.remove();
  return color;
}

/** A query in one state, as useQuery gives it. */
function queryOf(state: Partial<QueryLike<readonly string[]>>): QueryLike<readonly string[]> {
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error: null,
    isPending: false,
    refetch: () => null,
    ...state,
  };
}

const list = (rows: readonly string[]): React.ReactNode => (
  <ul>
    {rows.map((row) => (
      <li key={row}>{row}</li>
    ))}
  </ul>
);

describe("Sparkline", () => {
  test("is an image named by its label, 96 by 24 unless sized, marking its last value", async () => {
    const screen = await render(<Sparkline label="NAV, up" values={[1, 2, 3]} />);
    const image = screen.getByRole("img", { name: "NAV, up" });
    await expect.element(image).toBeVisible();
    const box = image.element().getBoundingClientRect();
    expect([box.width, box.height]).toStrictEqual([96, 24]);
    expect(image.element().querySelectorAll("circle")).toHaveLength(1);
  });

  test("takes the gain colour for a rise, the loss colour for a fall, and the reverse when a rise is a loss", async () => {
    const screen = await render(
      <>
        <Sparkline label="up" values={[1, 2]} trend />
        <Sparkline label="down" values={[2, 1]} trend />
        <Sparkline label="up, a loss" values={[1, 2]} trend rising="loss" />
      </>,
    );
    const colour = (name: string): string =>
      getComputedStyle(screen.getByRole("img", { name }).element()).color;
    expect([colour("up"), colour("down"), colour("up, a loss")]).toStrictEqual([
      computedColour("var(--gain)"),
      computedColour("var(--loss)"),
      computedColour("var(--loss)"),
    ]);
  });
});

describe("CellBar", () => {
  test("shows its text over a bar as wide as the value's share, hidden from screen readers", async () => {
    const screen = await render(
      <div className="w-60">
        <CellBar value={25} max={100} data-testid="cell">
          25
        </CellBar>
      </div>,
    );
    await expect.element(screen.getByText("25")).toBeVisible();
    const cell = screen.getByTestId("cell").element();
    const svg = cell.querySelector("svg");
    const bar = cell.querySelector("rect")?.getBoundingClientRect();
    expect(svg?.closest("[aria-hidden]")).not.toBeNull();
    expect((bar?.width ?? 0) / (svg?.getBoundingClientRect().width ?? 1)).toBeCloseTo(0.25, 2);
  });

  test("grows a signed column's loss leftwards from the middle in the loss colour", async () => {
    const screen = await render(
      <div className="w-60">
        <CellBar value={-50} max={100} signed data-testid="cell">
          -50
        </CellBar>
      </div>,
    );
    const cell = screen.getByTestId("cell").element();
    const svg = cell.querySelector("svg")?.getBoundingClientRect();
    const rect = cell.querySelector("rect");
    const bar = rect?.getBoundingClientRect();
    expect(bar?.right ?? 0).toBeCloseTo((svg?.left ?? 0) + (svg?.width ?? 0) / 2, 0);
    expect(getComputedStyle(rect ?? cell).fill).toBe(computedColour("var(--loss)"));
  });
});

describe("QueryState", () => {
  test("stands a busy skeleton in while loading", async () => {
    const screen = await render(
      <QueryState query={queryOf({ isPending: true })}>{list}</QueryState>,
    );
    await expect.element(screen.getByLabelText("Loading")).toHaveAttribute("aria-busy", "true");
  });

  test("says why it failed, and retries", async () => {
    const refetch = vi.fn();
    const screen = await render(
      <QueryState query={queryOf({ error: new Error("No answer in time."), refetch })}>
        {list}
      </QueryState>,
    );
    await expect.element(screen.getByRole("alert")).toBeVisible();
    await screen.getByRole("button", { name: "Try again" }).click();
    expect(refetch).toHaveBeenCalledOnce();
  });

  test("shows an empty state, then the data under its age, in the warning colour once stale", async () => {
    const empty = await render(
      <QueryState
        query={queryOf({ data: [], dataUpdatedAt: Date.now() })}
        emptyTitle="No positions"
      >
        {list}
      </QueryState>,
    );
    await expect.element(empty.getByText("No positions")).toBeVisible();
    await empty.unmount();
    const stale = await render(
      <QueryState
        query={queryOf({ data: ["912828C57"], dataUpdatedAt: Date.now() - 45 * 60_000 })}
        staleAfter={{ minutes: 15 }}
      >
        {list}
      </QueryState>,
    );
    await expect.element(stale.getByText("912828C57")).toBeVisible();
    const age = stale.getByText(/As of 45 min\. ago/u);
    await expect.element(age).toBeVisible();
    const line = age.element().closest("p") ?? age.element();
    expect(getComputedStyle(line).color).toBe(computedColour("var(--warning)"));
  });
});

describe("the small charts and states page", () => {
  test("shows each component", async () => {
    const screen = await render(<SmallChartsAndStates />);
    await expect.element(screen.getByRole("img", { name: "NAV over ten days, up" })).toBeVisible();
    await expect.element(screen.getByText("Financials")).toBeVisible();
    await expect.element(screen.getByText("No positions")).toBeVisible();
  });
});
