/* CommandDialog, a Command in a Dialog: the command palette. From shadcn's Base UI source (its base-nova style), which
 * passes classes to DialogContent that `shadcn/no-restyle` forbids, so it renders Base UI's dialog parts with Dialog's
 * veil. Its popup fades and scales through Base UI's `data-starting-style` and `data-ending-style`, as Dialog's does,
 * and stands a third of the way down the screen in Base UI's viewport, where shadcn moves DialogContent there with
 * `top-1/3 translate-y-0`. Its title and description sit inside the popup, hidden, where shadcn puts them outside. */

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import type { ReactElement, ReactNode } from "react";

import { DialogOverlay, DialogPortal } from "./dialog.tsx";

/** The command palette: put a Command inside it. Escape and a click outside close it, and focus returns to the
 * trigger. `title` and `description` name and describe it for assistive technology, and are not shown; `className`
 * may set its width. */
function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  ...props
}: Omit<DialogPrimitive.Root.Props, "children"> & {
  readonly title?: string;
  readonly description?: string;
  readonly className?: string;
  /** Adds a close button for assistive technology, which is hidden, since Escape closes the palette. */
  readonly showCloseButton?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <DialogPrimitive.Root data-slot="command-dialog" {...props}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Viewport
          data-slot="command-dialog-viewport"
          className="fixed inset-0 z-50 flex justify-center overflow-y-auto p-4"
        >
          <DialogPrimitive.Popup
            data-slot="command-dialog-content"
            className={cn(
              "relative top-1/3 h-fit w-full overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 transition duration-100 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 sm:max-w-sm",
              className,
            )}
          >
            <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {description}
            </DialogPrimitive.Description>
            {children}
            {showCloseButton ? (
              <DialogPrimitive.Close className="sr-only">Close</DialogPrimitive.Close>
            ) : null}
          </DialogPrimitive.Popup>
        </DialogPrimitive.Viewport>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

export { CommandDialog };
