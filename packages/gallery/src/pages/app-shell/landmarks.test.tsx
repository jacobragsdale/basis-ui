import "#styles.css";

import { AppShell, BasisApp, DataTable, Page, TableIcon, fakeSignIn } from "@basis/ui";
import type { DataTableColumn } from "@basis/ui";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import axe from "axe-core";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

/** The rules on landmarks and on content outside them, which an app's `vp run shot` runs on every page. */
const landmarkRules = [
  "landmark-banner-is-top-level",
  "landmark-complementary-is-top-level",
  "landmark-main-is-top-level",
  "landmark-no-duplicate-banner",
  "landmark-no-duplicate-main",
  "landmark-one-main",
  "landmark-unique",
  "region",
];

function Shell(): ReactElement {
  return <AppShell appName="Rates" environment="qa" />;
}

interface Trade {
  readonly id: string;
}

const trades: readonly Trade[] = Array.from({ length: 12 }, (_row, index) => ({
  id: `T${String(index + 1)}`,
}));

const tradeColumns: readonly DataTableColumn<Trade>[] = [
  { header: "Trade", id: "id", value: (row) => row.id },
];

/** A page with a paged DataTable, whose pages' navigation must not take the sidebar's name. */
function TradesPage(): ReactElement {
  return (
    <Page title="Trades" description="The desk's trades today.">
      <DataTable
        label="Trades"
        columns={tradeColumns}
        data={trades}
        getRowId={(row) => row.id}
        pageSize={10}
      />
    </Page>
  );
}

const rootRoute = createRootRoute({ component: Shell });

const routeTree = rootRoute.addChildren([
  createRoute({
    component: TradesPage,
    getParentRoute: () => rootRoute,
    path: "/",
    staticData: { group: "Tables", icon: TableIcon, title: "Trades" },
  }),
]);

beforeEach(async () => {
  await page.viewport(1280, 800);
});

describe("the shell's landmarks", () => {
  test("an app on the shell, rendered as an app renders it, has one main, a banner, and nothing outside a landmark", async () => {
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      routeTree,
    });
    const screen = await render(<BasisApp router={router} signIn={fakeSignIn()} />);
    await expect.element(screen.getByRole("heading", { level: 1, name: "Trades" })).toBeVisible();
    const results = await axe.run(document, { runOnly: { type: "rule", values: landmarkRules } });
    const found = results.violations.flatMap((violation) =>
      violation.nodes.map((node) => `${violation.id} at ${node.target.join(" ")}`),
    );
    expect([
      found,
      screen.getByRole("main").elements().length,
      screen.getByRole("banner").elements().length,
      screen.getByRole("complementary", { name: "Rates" }).elements().length,
    ]).toStrictEqual([[], 1, 1, 1]);
  });
});
