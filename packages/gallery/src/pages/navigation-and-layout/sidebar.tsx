/* Sidebar on the navigation and layout page: an app's frame in each variant, folding to its icon rail or off the
 * canvas, and a fixed sidebar with every part. Each frame is the containing block for the sidebar's fixed panel, so
 * the sidebar sits in the frame rather than at the window's edge, and its page is a `<div>`, since the gallery's page
 * is already the `<main>`. */

import {
  CalendarIcon,
  ClockIcon,
  DownloadIcon,
  EllipsisIcon,
  PlusIcon,
  Separator,
  SettingsIcon,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  TrendingUpIcon,
  UserIcon,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

import { Demo } from "./demo.tsx";

const pagesOfTheDesk = [
  { href: "#positions", Icon: TrendingUpIcon, title: "Positions" },
  { href: "#settlements", Icon: CalendarIcon, title: "Settlements" },
  { href: "#history", Icon: ClockIcon, title: "History" },
  { href: "#reports", Icon: DownloadIcon, title: "Reports" },
] as const;

interface ShellProps {
  readonly variant?: "sidebar" | "floating" | "inset";
  readonly side?: "left" | "right";
  readonly collapsible?: "offcanvas" | "icon";
  readonly defaultOpen?: boolean;
}

/** The desk's pages, each a link with a tooltip that names it on the icon rail; the first is the current page. */
function DeskMenu(): ReactElement {
  return (
    <SidebarMenu>
      {pagesOfTheDesk.map(({ href, Icon, title }, index) => (
        <SidebarMenuItem key={href}>
          <SidebarMenuButton
            isActive={index === 0}
            tooltip={title}
            render={
              <a href={href}>
                <Icon />
                <span>{title}</span>
              </a>
            }
          />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

/** The sidebar of an app's frame, with its pages, its settings in the footer, and its rail. */
function ShellSidebar({
  variant = "sidebar",
  side = "left",
  collapsible = "icon",
}: Omit<ShellProps, "defaultOpen">): ReactElement {
  return (
    <Sidebar variant={variant} side={side} collapsible={collapsible} className="h-full">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Rates desk</SidebarGroupLabel>
          <SidebarGroupContent>
            <DeskMenu />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings">
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** An app's frame: the sidebar, and the page beside it with the trigger in its header. A sidebar on the right comes
 * after the page, so that the gap that holds its place sits on the right. */
function SidebarShell({ defaultOpen = true, ...shell }: ShellProps): ReactElement {
  const sidebar = <ShellSidebar {...shell} />;
  const onTheRight = shell.side === "right";
  return (
    <div className="h-80 overflow-hidden rounded-xl border contain-layout">
      <SidebarProvider defaultOpen={defaultOpen} className="h-full min-h-0">
        {onTheRight ? null : sidebar}
        <SidebarInset render={<div />}>
          <header className="flex h-12 items-center gap-2 border-b px-3">
            <SidebarTrigger />
            <div className="flex h-4">
              <Separator orientation="vertical" />
            </div>
            <p className="text-sm font-medium">Positions</p>
          </header>
          <p className="p-4 text-sm text-muted-foreground">Ctrl+B folds and unfolds the sidebar.</p>
        </SidebarInset>
        {onTheRight ? sidebar : null}
      </SidebarProvider>
    </div>
  );
}

/** A group of books with an action, a badge, a hover action, a sub-menu, and the small outline button. */
function BooksGroup(): ReactElement {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Books</SidebarGroupLabel>
      <SidebarGroupAction aria-label="Add a book">
        <PlusIcon />
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive>
              <span>Treasuries</span>
            </SidebarMenuButton>
            <SidebarMenuBadge>24</SidebarMenuBadge>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <span>Agencies</span>
            </SidebarMenuButton>
            <SidebarMenuAction aria-label="More for Agencies" showOnHover>
              <EllipsisIcon />
            </SidebarMenuAction>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <span>Municipals</span>
            </SidebarMenuButton>
            <SidebarMenuSub>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton href="#new-york" isActive>
                  <span>New York</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton href="#california" size="sm">
                  <span>California</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton variant="outline" size="sm">
              <span>Archived</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** A sidebar that does not fold, with an input in its header, its groups, skeletons and a footer. */
function SidebarParts(): ReactElement {
  return (
    <div className="h-120 overflow-hidden rounded-xl border">
      <SidebarProvider className="h-full min-h-0">
        <Sidebar collapsible="none" className="h-full">
          <SidebarHeader>
            <SidebarInput aria-label="Filter books" placeholder="Filter books" />
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            <BooksGroup />
            <SidebarGroup>
              <SidebarGroupLabel>Loading</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <UserIcon />
                  <span>A. Trader</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
      </SidebarProvider>
    </div>
  );
}

function SidebarSection(): ReactElement {
  return (
    <Section
      title="Sidebar"
      description="The app's navigation beside its page. The trigger, the rail and Ctrl+B fold it; the basis-ui-sidebar cookie remembers the choice."
    >
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Demo label="sidebar, folding to its icon rail">
          <SidebarShell />
        </Demo>
        <Demo label="floating, on the right, folding off the canvas">
          <SidebarShell variant="floating" side="right" collapsible="offcanvas" />
        </Demo>
        <Demo label="inset, folding to its icon rail">
          <SidebarShell variant="inset" />
        </Demo>
        <Demo label="collapsible none, with every part">
          <SidebarParts />
        </Demo>
      </div>
    </Section>
  );
}

export { SidebarParts, SidebarSection, SidebarShell };
