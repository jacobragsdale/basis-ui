/* Drawer and its parts, from shadcn's Base UI source (its base-nova style), on Base UI's own Drawer rather than vaul.
 * shadcn styles the drawer with some forty arbitrary values: custom properties set by arbitrary classes, cubic-bezier
 * easings, `calc()` translations and durations, and a bleed pseudo-element. Here every class is on the theme's
 * scales, which changes these things:
 * - The panel follows the pointer through Base UI's swipe variables, as in shadcn, and opens with a fade and a slide of
 *   the spacing scale's `10` rather than from off the screen, on a short transition that the theme's reduced-motion rule
 *   stops; Citrix desktops draw on the CPU. Closed with a swipe, it fades where the swipe left it.
 * - The backdrop veils the page in the theme's background, at once, where shadcn darkens it with black, blurs it, and
 *   fades it in and with the swipe: a full-screen fade repaints the whole screen every frame on a Citrix desktop.
 * - Snap points are left out of the props, since placing the panel at a snap point needs the swipe and snap offsets
 *   added in a `calc()`, and nested drawers stack without shadcn's scaling.
 * - A bottom or top drawer is at most four fifths of the screen's height, where shadcn leaves 6rem.
 * - The title drops `font-heading`, a font the theme does not define. */

import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "cn";
import { createContext, use, useMemo } from "react";
import type { ComponentProps, ReactElement } from "react";

interface DrawerContextValue {
  readonly modal: DrawerPrimitive.Root.Props["modal"];
  readonly showSwipeHandle: boolean;
  readonly swipeDirection: NonNullable<DrawerPrimitive.Root.Props["swipeDirection"]>;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

function useDrawer(): DrawerContextValue {
  const context = use(DrawerContext);
  if (context === null) {
    throw new Error("A DrawerContent must be inside a Drawer.");
  }
  return context;
}

type DrawerProps = Omit<
  DrawerPrimitive.Root.Props,
  "defaultSnapPoint" | "onSnapPointChange" | "snapPoint" | "snapPoints" | "snapToSequentialPoints"
> & {
  /** Whether the panel shows a grip at its leading edge, which says it can be swiped. */
  readonly showSwipeHandle?: boolean;
};

/** A drawer: a panel that slides in from an edge and can be swiped away, `down` by default. It is a dialog: Escape,
 * a click outside and a swipe in `swipeDirection` close it, and focus returns to the trigger.
 *
 * @example
 * ```tsx
 * import { Button, Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@basis/ui";
 *
 * <Drawer>
 *   <DrawerTrigger render={<Button variant="outline" />}>Show filters</DrawerTrigger>
 *   <DrawerContent>
 *     <DrawerHeader>
 *       <DrawerTitle>Filters</DrawerTitle>
 *       <DrawerDescription>Narrow the positions shown.</DrawerDescription>
 *     </DrawerHeader>
 *   </DrawerContent>
 * </Drawer>;
 * ```
 */
function Drawer({
  modal = true,
  showSwipeHandle = false,
  swipeDirection = "down",
  ...props
}: DrawerProps): ReactElement {
  const context = useMemo<DrawerContextValue>(
    () => ({ modal, showSwipeHandle, swipeDirection }),
    [modal, showSwipeHandle, swipeDirection],
  );
  return (
    <DrawerContext value={context}>
      <DrawerPrimitive.Root
        data-slot="drawer"
        modal={modal}
        swipeDirection={swipeDirection}
        {...props}
      />
    </DrawerContext>
  );
}

/** The control that opens the drawer; `render={<Button />}` makes it a button. */
function DrawerTrigger(props: DrawerPrimitive.Trigger.Props): ReactElement {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

/** Renders the drawer's popup into the page's body. `DrawerContent` includes one. */
function DrawerPortal(props: DrawerPrimitive.Portal.Props): ReactElement {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

/** A control that closes the drawer; `render={<Button variant="outline" />}` makes it a button. */
function DrawerClose(props: DrawerPrimitive.Close.Props): ReactElement {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

/** The veil over the page behind a modal drawer. */
function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props): ReactElement {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-popup bg-overlay select-none data-ending-style:pointer-events-none",
        className,
      )}
      {...props}
    />
  );
}

/** The grip at the panel's leading edge. It is decoration: the panel itself takes the swipe. */
function DrawerSwipeHandle({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="drawer-swipe-handle"
      aria-hidden="true"
      className={cn(
        "relative z-raised flex shrink-0 cursor-grab group-data-[swipe-axis=x]/drawer-popup:h-full group-data-[swipe-axis=x]/drawer-popup:w-3 group-data-[swipe-axis=x]/drawer-popup:items-center group-data-[swipe-axis=y]/drawer-popup:h-3 group-data-[swipe-axis=y]/drawer-popup:w-full group-data-[swipe-axis=y]/drawer-popup:justify-center group-data-[swipe-direction=down]/drawer-popup:items-end group-data-[swipe-direction=left]/drawer-popup:order-last group-data-[swipe-direction=left]/drawer-popup:justify-start group-data-[swipe-direction=right]/drawer-popup:justify-end group-data-[swipe-direction=up]/drawer-popup:order-last group-data-[swipe-direction=up]/drawer-popup:items-start after:block after:shrink-0 after:rounded-pill after:bg-muted group-data-[swipe-axis=x]/drawer-popup:after:h-24 group-data-[swipe-axis=x]/drawer-popup:after:w-1 group-data-[swipe-axis=y]/drawer-popup:after:h-1 group-data-[swipe-axis=y]/drawer-popup:after:w-24 active:cursor-grabbing",
        className,
      )}
      {...props}
    />
  );
}

/** The panel, in a portal over the veil when the drawer is modal, against the edge its swipe direction points to. */
function DrawerContent({
  className,
  children,
  ...props
}: DrawerPrimitive.Popup.Props): ReactElement {
  const { modal, showSwipeHandle, swipeDirection } = useDrawer();
  const swipeAxis = swipeDirection === "down" || swipeDirection === "up" ? "y" : "x";
  return (
    <DrawerPortal>
      {modal === true ? <DrawerOverlay /> : null}
      <DrawerPrimitive.Viewport
        data-slot="drawer-viewport"
        data-modal={modal}
        className="pointer-events-none fixed inset-0 z-popup select-none data-[modal=true]:pointer-events-auto"
      >
        <DrawerPrimitive.Popup
          data-slot="drawer-popup"
          data-swipe-axis={swipeAxis}
          className={cn(
            "group/drawer-popup pointer-events-auto fixed z-popup flex min-h-0 flex-col bg-popover text-sm text-popover-foreground shadow-md transition duration-panel outline-none select-none data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0",
            "data-[swipe-direction=down]:inset-x-0 data-[swipe-direction=down]:bottom-0 data-[swipe-direction=down]:max-h-4/5 data-[swipe-direction=down]:translate-y-(--drawer-swipe-movement-y) data-[swipe-direction=down]:rounded-t-xl data-[swipe-direction=down]:border-t data-[swipe-direction=down]:data-starting-style:translate-y-10 data-[swipe-direction=down]:not-data-swipe-dismiss:data-ending-style:translate-y-10",
            "data-[swipe-direction=up]:inset-x-0 data-[swipe-direction=up]:top-0 data-[swipe-direction=up]:max-h-4/5 data-[swipe-direction=up]:translate-y-(--drawer-swipe-movement-y) data-[swipe-direction=up]:rounded-b-xl data-[swipe-direction=up]:border-b data-[swipe-direction=up]:data-starting-style:-translate-y-10 data-[swipe-direction=up]:not-data-swipe-dismiss:data-ending-style:-translate-y-10",
            "data-[swipe-direction=left]:inset-y-0 data-[swipe-direction=left]:left-0 data-[swipe-direction=left]:w-3/4 data-[swipe-direction=left]:translate-x-(--drawer-swipe-movement-x) data-[swipe-direction=left]:flex-row data-[swipe-direction=left]:rounded-r-xl data-[swipe-direction=left]:border-r data-[swipe-direction=left]:data-starting-style:-translate-x-10 data-[swipe-direction=left]:not-data-swipe-dismiss:data-ending-style:-translate-x-10 data-[swipe-direction=left]:sm:w-96",
            "data-[swipe-direction=right]:inset-y-0 data-[swipe-direction=right]:right-0 data-[swipe-direction=right]:w-3/4 data-[swipe-direction=right]:translate-x-(--drawer-swipe-movement-x) data-[swipe-direction=right]:flex-row data-[swipe-direction=right]:rounded-l-xl data-[swipe-direction=right]:border-l data-[swipe-direction=right]:data-starting-style:translate-x-10 data-[swipe-direction=right]:not-data-swipe-dismiss:data-ending-style:translate-x-10 data-[swipe-direction=right]:sm:w-96",
            className,
          )}
          {...props}
        >
          {showSwipeHandle ? <DrawerSwipeHandle /> : null}
          <DrawerPrimitive.Content
            data-slot="drawer-content"
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain select-text group-data-swiping/drawer-popup:select-none"
          >
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  );
}

/** The drawer's title and description, stacked at its top. */
function DrawerHeader({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex shrink-0 flex-col gap-0.5 p-4 pb-0 group-data-[swipe-axis=y]/drawer-popup:text-center md:gap-0.5 md:text-left",
        className,
      )}
      {...props}
    />
  );
}

/** The drawer's actions, at its foot. */
function DrawerFooter({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex shrink-0 flex-col gap-2 p-4 pt-0", className)}
      {...props}
    />
  );
}

/** The drawer's title, which names it for assistive technology. */
function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props): ReactElement {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-base font-medium text-foreground", className)}
      {...props}
    />
  );
}

/** The drawer's description, under its title, which screen readers announce with it. */
function DrawerDescription({
  className,
  ...props
}: DrawerPrimitive.Description.Props): ReactElement {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-balance text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerSwipeHandle,
  DrawerTitle,
  DrawerTrigger,
};
