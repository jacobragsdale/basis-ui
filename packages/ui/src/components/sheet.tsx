/* Sheet and its parts, from shadcn's Base UI source (its base-nova style): a Dialog that slides in from an edge of the
 * screen. The changes:
 * - The backdrop veils the page in the theme's background, where shadcn darkens it with black and blurs it.
 * - The panel slides by the spacing scale's `10` (2.5rem in the comfortable density) where shadcn writes 2.5rem as an
 *   arbitrary value, and on a shorter transition; the theme's reduced-motion rule stops it.
 * - Its shadow is the theme's `shadow-md`, since the theme has no `shadow-lg`.
 * - The title drops `font-heading`, a font the theme does not define. */

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import { XIcon } from "#vendor/lucide/x.tsx";

import { Button } from "./button.tsx";
import { sheetContentVariants, sheetOverlayVariants } from "./sheet-variants.ts";

/** A sheet: a panel over the page from one edge, for a form or details beside the current page. It is a dialog:
 * Escape, a click outside and its close button close it, and focus returns to the trigger.
 *
 * @use For a form or details beside the current page, from one edge, such as a trade's detail. For a short task in the
 * middle of the page, use Dialog; for a panel swiped away on a touch screen, Drawer.
 * @see Dialog, Drawer, Button, Field
 *
 * @example
 * ```tsx
 * import { Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@basis/ui";
 *
 * <Sheet>
 *   <SheetTrigger render={<Button variant="outline" />}>Trade details</SheetTrigger>
 *   <SheetContent>
 *     <SheetHeader>
 *       <SheetTitle>Trade details</SheetTitle>
 *       <SheetDescription>Bought 5,000 par at 99-16.</SheetDescription>
 *     </SheetHeader>
 *   </SheetContent>
 * </Sheet>;
 * ```
 */
function Sheet(props: SheetPrimitive.Root.Props): ReactElement {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

/** The control that opens the sheet; `render={<Button />}` makes it a button. */
function SheetTrigger(props: SheetPrimitive.Trigger.Props): ReactElement {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

/** A control that closes the sheet; `render={<Button variant="outline" />}` makes it a button. */
function SheetClose(props: SheetPrimitive.Close.Props): ReactElement {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal(props: SheetPrimitive.Portal.Props): ReactElement {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props): ReactElement {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(sheetOverlayVariants(), className)}
      {...props}
    />
  );
}

/** The panel, in a portal over the veil, against the edge `side` names (`right` by default), with a close button in
 * its corner unless `showCloseButton` is false. */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  /** The edge of the page the panel comes from: the right by default. */
  readonly side?: "top" | "right" | "bottom" | "left";
  /** Whether the panel has a close button at its top right corner; true by default. */
  readonly showCloseButton?: boolean;
}): ReactElement {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(sheetContentVariants(), className)}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={<Button variant="ghost" className="absolute top-3 right-3" size="icon-sm" />}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

/** The sheet's title and description, stacked at its top. */
function SheetHeader({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  );
}

/** The sheet's actions, at its foot. */
function SheetFooter({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

/** The sheet's title, which names it for assistive technology. */
function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props): ReactElement {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-medium text-foreground", className)}
      {...props}
    />
  );
}

/** The sheet's description, under its title, which screen readers announce with it. */
function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props): ReactElement {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
