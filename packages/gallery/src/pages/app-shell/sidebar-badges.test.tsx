import "#styles.css";

import {
  AppShell,
  BasisApp,
  InboxIcon,
  Page,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  TableIcon,
  fakeSignIn,
} from "@basis/ui";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

function Shell(): ReactElement {
  return (
    <AppShell
      appName="Work"
      badges={{ "/inbox": 12 }}
      sidebarSections={
        <SidebarGroup>
          <SidebarGroupLabel>Pinned views</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>Blocked</SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      }
    />
  );
}

function Items(): ReactElement {
  return <Page title="Items">The items</Page>;
}

const rootRoute = createRootRoute({ component: Shell });
const routeTree = rootRoute.addChildren([
  createRoute({
    component: Items,
    getParentRoute: () => rootRoute,
    path: "/",
    staticData: { icon: TableIcon, title: "Items" },
  }),
  createRoute({
    component: Items,
    getParentRoute: () => rootRoute,
    path: "/inbox",
    staticData: { icon: InboxIcon, title: "Inbox" },
  }),
]);

describe("the sidebar's badges and sections", () => {
  test("a page's badge shows beside its item, and a section of the app's own below the pages", async () => {
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      routeTree,
    });
    const screen = await render(<BasisApp router={router} signIn={fakeSignIn()} />);
    const sidebar = screen.getByRole("complementary", { name: "Work" });
    await expect.element(sidebar.getByRole("link", { name: "Inbox" })).toBeVisible();
    await expect.element(sidebar.getByText("12")).toBeVisible();
    await expect.element(sidebar.getByText("Pinned views")).toBeVisible();
    await expect.element(sidebar.getByText("Blocked")).toBeVisible();
  });
});
