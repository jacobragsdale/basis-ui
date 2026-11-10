import "#styles.css";

import {
  AppShell,
  BasisApp,
  ChartLineIcon,
  Page,
  RefreshCwIcon,
  TableIcon,
  fakeSignIn,
  useShortcut,
} from "@basis/ui";
import type { PaletteCommand } from "@basis/ui";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

/** What the commands ran, by id. */
const ran: string[] = [];

const commands: readonly PaletteCommand[] = [
  {
    group: "Prices",
    icon: RefreshCwIcon,
    id: "refresh",
    keywords: ["reload"],
    label: "Refresh prices",
    run: () => {
      ran.push("refresh");
    },
    shortcut: "mod+shift+r",
  },
  {
    group: "View",
    id: "compact",
    label: "Show more rows",
    run: () => {
      ran.push("compact");
    },
  },
  {
    id: "help",
    label: "Open the help",
    run: () => {
      ran.push("help");
    },
  },
];

function TradesPage(): ReactElement {
  useShortcut("e", "Export the trades", () => {
    ran.push("export");
  });
  return <Page title="Trades">The trades.</Page>;
}

function CurvesPage(): ReactElement {
  return <Page title="Curves">The curves.</Page>;
}

function Shell(): ReactElement {
  return <AppShell appName="Rates" commands={commands} />;
}

const rootRoute = createRootRoute({ component: Shell });

const routeTree = rootRoute.addChildren([
  createRoute({
    component: TradesPage,
    getParentRoute: () => rootRoute,
    path: "/",
    staticData: { group: "Tables", icon: TableIcon, title: "Trades" },
  }),
  createRoute({
    component: CurvesPage,
    getParentRoute: () => rootRoute,
    path: "/curves",
    staticData: { group: "Charts", icon: ChartLineIcon, title: "Curves" },
  }),
]);

function App(): ReactElement {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree,
  });
  return (
    <section aria-label="An app" className="relative h-svh overflow-hidden transform-gpu">
      <BasisApp router={router} signIn={fakeSignIn()} />
    </section>
  );
}

const palette = page.getByRole("dialog", { name: "Go to or run" });

/** Opens the palette with Ctrl+K. */
async function openPalette(): Promise<void> {
  await userEvent.keyboard("{Control>}k{/Control}");
  await expect.element(palette).toBeVisible();
}

beforeEach(async () => {
  ran.length = 0;
  await page.viewport(1280, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the command palette", () => {
  test("lists the commands under their groups, after the pages, with Commands for those with none", async () => {
    const screen = await render(<App />);
    await expect.element(screen.getByRole("heading", { level: 1, name: "Trades" })).toBeVisible();
    await openPalette();
    const headings = [...palette.element().querySelectorAll('[data-slot="command-group-heading"]')];
    expect(headings.map((heading) => heading.textContent)).toStrictEqual([
      "Go to",
      "Prices",
      "View",
      "Commands",
    ]);
  });

  test("finds a command by a keyword, and a page by its group", async () => {
    const screen = await render(<App />);
    await expect.element(screen.getByRole("heading", { level: 1, name: "Trades" })).toBeVisible();
    await openPalette();
    await userEvent.keyboard("reload");
    await expect.element(palette.getByRole("option", { name: /Refresh prices/u })).toBeVisible();
    await expect.element(palette.getByRole("option")).toHaveLength(1);
    await userEvent.clear(palette.getByRole("combobox"));
    await userEvent.keyboard("charts");
    await expect.element(palette.getByRole("option", { name: "Curves" })).toBeVisible();
    await expect.element(palette.getByRole("option")).toHaveLength(1);
  });

  test("shows a command's icon and its shortcut, which the search does not match", async () => {
    const screen = await render(<App />);
    await expect.element(screen.getByRole("heading", { level: 1, name: "Trades" })).toBeVisible();
    await openPalette();
    const refresh = palette.getByRole("option", { name: /Refresh prices/u });
    await expect.element(refresh).toBeVisible();
    expect([
      refresh.element().querySelector("svg") !== null,
      refresh.element().querySelector('[data-slot="command-shortcut"]')?.textContent,
    ]).toStrictEqual([true, "Ctrl+Shift+R"]);
    await userEvent.keyboard("shift");
    await expect.element(palette.getByText("Nothing matches.")).toBeVisible();
  });

  test("a command's shortcut runs it with the palette closed, and the ? list names it", async () => {
    const screen = await render(<App />);
    await expect.element(screen.getByRole("heading", { level: 1, name: "Trades" })).toBeVisible();
    await userEvent.keyboard("{Control>}{Shift>}R{/Shift}{/Control}");
    expect(ran).toStrictEqual(["refresh"]);
    await userEvent.keyboard("?");
    const list = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect.element(list.getByText("Refresh prices")).toBeVisible();
  });

  test("choosing a command closes the palette and runs it", async () => {
    const screen = await render(<App />);
    await expect.element(screen.getByRole("heading", { level: 1, name: "Trades" })).toBeVisible();
    await openPalette();
    await palette.getByRole("option", { name: "Show more rows" }).click();
    await expect.element(palette).not.toBeInTheDocument();
    expect(ran).toStrictEqual(["compact"]);
  });
});

describe("a page's shortcuts", () => {
  test("are listed under the page's title", async () => {
    const screen = await render(<App />);
    await expect.element(screen.getByRole("heading", { level: 1, name: "Trades" })).toBeVisible();
    await userEvent.keyboard("?");
    const list = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect.element(list.getByText("Export the trades")).toBeVisible();
    expect([...list.element().querySelectorAll("th")].map((th) => th.textContent)).toStrictEqual([
      "Trades",
      "Everywhere",
    ]);
  });

  test("go with the page", async () => {
    const screen = await render(<App />);
    await expect.element(screen.getByRole("heading", { level: 1, name: "Trades" })).toBeVisible();
    await screen.getByRole("link", { name: "Curves" }).click();
    await expect.element(screen.getByRole("heading", { level: 1, name: "Curves" })).toBeVisible();
    await userEvent.keyboard("e");
    expect(ran).toStrictEqual([]);
  });
});
