/* Sidebar's frame, from shadcn's Base UI source: the provider, the sidebar itself, its trigger, its rail and the
 * inset beside it. Its header, footer, separator, input and content are in sidebar-sections.tsx, its groups in
 * sidebar-group.tsx, its menus in sidebar-menu.tsx, and its state, cookie and shortcut in sidebar-context.ts.
 *
 * Changes from shadcn's source:
 * - It folds to its icon rail, or off the canvas, at once. shadcn animates its width and position, which lays the
 *   page out on every frame, and Citrix desktops draw on the CPU.
 * - The floating and inset rail's width is the rail plus the frame's padding through `box-content`, where shadcn
 *   adds them with arbitrary `calc()` widths.
 * - Below the `md` breakpoint it is a Sheet whose panel draws on Base UI's dialog with the Sheet's classes, from
 *   sheet-variants.ts, in the sidebar's colours: shadcn's colour classes on SheetContent would fail `no-restyle`.
 * - SidebarInset takes `render`, as the sidebar's other parts do, so a page that already has its `<main>` can make
 *   it a `<div>`.
 * - Right-to-left support is left out, as @basis/ui does throughout. */

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type { ComponentProps, ReactElement, ReactNode } from "react";

import { PanelLeftIcon } from "#vendor/lucide/panel-left.tsx";

import { Button } from "./button.tsx";
import { Sheet } from "./sheet.tsx";
import { sheetContentVariants, sheetOverlayVariants } from "./sheet-variants.ts";
import { SidebarContext, useSidebar, useSidebarState } from "./sidebar-context.ts";

const sidebarWidth = "16rem";
const sidebarWidthMobile = "18rem";
const sidebarWidthIcon = "3rem";

type SidebarSide = "left" | "right";
type SidebarVariant = "sidebar" | "floating" | "inset";
type SidebarCollapsible = "offcanvas" | "icon" | "none";

interface SidebarProviderProps extends ComponentProps<"div"> {
  /** Whether the sidebar starts open when the cookie holds no choice yet; `true` by default. */
  readonly defaultOpen?: boolean | undefined;
  /** Whether the sidebar is open, when the app controls it. */
  readonly open?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
}

/** Holds the sidebar's state for the Sidebar, its trigger and `useSidebar`, and lays the sidebar and the page's
 * SidebarInset out side by side. Ctrl+B or Cmd+B toggles the sidebar, and the `basis-ui-sidebar` cookie keeps the
 * choice for a week. */
function SidebarProvider({
  defaultOpen = true,
  open,
  onOpenChange,
  className,
  style,
  children,
  ...props
}: SidebarProviderProps): ReactElement {
  const context = useSidebarState({ defaultOpen, onOpenChange, open });
  return (
    <SidebarContext value={context}>
      <div
        data-slot="sidebar-wrapper"
        style={{
          "--sidebar-width": sidebarWidth,
          "--sidebar-width-icon": sidebarWidthIcon,
          ...style,
        }}
        className={cn(
          "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext>
  );
}

interface SidebarProps extends ComponentProps<"div"> {
  readonly side?: SidebarSide | undefined;
  /** `sidebar` sits against the page's edge, `floating` is a raised panel, `inset` sets the page in a panel. */
  readonly variant?: SidebarVariant | undefined;
  /** `offcanvas` slides it away, `icon` folds it to its icons, `none` keeps it open. */
  readonly collapsible?: SidebarCollapsible | undefined;
}

/** The sidebar below the `md` breakpoint: a Sheet, opened by the trigger, whose panel draws on Base UI's dialog with
 * the Sheet's classes in the sidebar's colours and width, and without the Sheet's close button. */
function SidebarSheet({
  side,
  children,
}: {
  readonly side: SidebarSide;
  readonly children: ReactNode;
}): ReactElement {
  const { openMobile, setOpenMobile } = useSidebar();
  return (
    <Sheet open={openMobile} onOpenChange={setOpenMobile}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop data-slot="sheet-overlay" className={sheetOverlayVariants()} />
        <DialogPrimitive.Popup
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          data-side={side}
          style={{ "--sidebar-width": sidebarWidthMobile }}
          className={cn(
            sheetContentVariants(),
            "gap-0 bg-sidebar text-sidebar-foreground data-[side=left]:w-(--sidebar-width) data-[side=right]:w-(--sidebar-width)",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Sidebar</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Displays the mobile sidebar.
          </DialogPrimitive.Description>
          <div className="flex h-full w-full flex-col">{children}</div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </Sheet>
  );
}

/** The sidebar from the `md` breakpoint up: a gap that holds its place in the row, and the fixed panel over it. */
function SidebarDesktop({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}: SidebarProps): ReactElement {
  const { state } = useSidebar();
  const framed = variant === "floating" || variant === "inset";
  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent group-data-[collapsible=offcanvas]:w-0 group-data-[side=right]:rotate-180 group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
          framed && "group-data-[collapsible=icon]:box-content group-data-[collapsible=icon]:px-2",
        )}
      />
      <div
        data-slot="sidebar-container"
        data-side={side}
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) group-data-[collapsible=icon]:w-(--sidebar-width-icon) data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:-left-(--sidebar-width) data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:-right-(--sidebar-width) md:flex",
          framed
            ? "p-2 group-data-[collapsible=icon]:box-content group-data-[collapsible=icon]:h-auto"
            : "group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className,
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** The app's sidebar, for its navigation. It folds by `collapsible`, and is a sheet below the `md` breakpoint.
 */
function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}: SidebarProps): ReactElement {
  const { isMobile } = useSidebar();
  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
  if (isMobile) {
    return <SidebarSheet side={side}>{children}</SidebarSheet>;
  }
  return (
    <SidebarDesktop
      side={side}
      variant={variant}
      collapsible={collapsible}
      className={className}
      {...props}
    >
      {children}
    </SidebarDesktop>
  );
}

/** The button that opens and closes the sidebar, named "Toggle Sidebar". */
function SidebarTrigger({ onClick, ...props }: ComponentProps<typeof Button>): ReactElement {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

/** A thin strip along the sidebar's edge that toggles it when clicked, for the pointer. It is out of the tab order,
 * and narrower than the 24 px target, as shadcn draws it: SidebarTrigger and the shortcut do the same, which is
 * WCAG 2.2's exception for a target with an equivalent. */
function SidebarRail({ className, ...props }: ComponentProps<"button">): ReactElement {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:start-1/2 after:w-0.5 hover:after:bg-sidebar-border sm:flex",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2 [[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className,
      )}
      {...props}
    />
  );
}

/** The page beside the sidebar, its `<main>`, or the element `render` names where the page already has one. With
 * the inset variant it sits in a raised panel. */
function SidebarInset({
  className,
  render,
  ...props
}: useRender.ComponentProps<"main">): ReactElement {
  const classes = cn(
    "relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
    className,
  );
  return useRender({
    defaultTagName: "main",
    props: mergeProps<"main">({ className: classes }, props),
    render,
    state: { slot: "sidebar-inset" },
  });
}

export { Sidebar, SidebarInset, SidebarProvider, SidebarRail, SidebarTrigger };
