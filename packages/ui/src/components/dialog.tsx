/* Dialog and its parts, from shadcn's Base UI source (its base-nova style), with these changes:
 * - The backdrop veils the page in the theme's background, where shadcn darkens it with black and blurs it. The theme
 *   has no black, and Citrix desktops draw blur on the CPU. It appears and goes at once: a fade of a veil the size of
 *   the screen repaints the whole screen every frame, which a Citrix desktop draws on the CPU and sends as an image.
 * - The popup fades and scales on a short transition through Base UI's `data-starting-style` and `data-ending-style`,
 *   which the theme's reduced-motion rule stops, in place of tw-animate-css's keyframes, which the theme lacks.
 * - The popup sits in Base UI's viewport, whose padding keeps it off the screen's edges in place of shadcn's arbitrary
 *   `max-w-[calc(100%-2rem)]`, and which scrolls a dialog taller than the screen.
 * - The title drops `font-heading`, a font the theme does not define. */

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import { XIcon } from "#vendor/lucide/x.tsx";

import { Button } from "./button.tsx";

/** A dialog: a window over the page that holds the user until it closes. Escape, a click outside and its close
 * button close it, and focus returns to the trigger.
 *
 * @example
 * ```tsx
 * import {
 *   Button,
 *   Dialog,
 *   DialogClose,
 *   DialogContent,
 *   DialogDescription,
 *   DialogFooter,
 *   DialogHeader,
 *   DialogTitle,
 *   DialogTrigger,
 * } from "@basis/ui";
 *
 * <Dialog>
 *   <DialogTrigger render={<Button variant="outline" />}>Edit position</DialogTrigger>
 *   <DialogContent>
 *     <DialogHeader>
 *       <DialogTitle>Edit position</DialogTitle>
 *       <DialogDescription>Change the book this position sits in.</DialogDescription>
 *     </DialogHeader>
 *     <DialogFooter>
 *       <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
 *     </DialogFooter>
 *   </DialogContent>
 * </Dialog>;
 * ```
 */
function Dialog(props: DialogPrimitive.Root.Props): ReactElement {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

/** The control that opens the dialog; `render={<Button />}` makes it a button. */
function DialogTrigger(props: DialogPrimitive.Trigger.Props): ReactElement {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

/** Renders the dialog's popup into the page's body. `DialogContent` includes one. */
function DialogPortal(props: DialogPrimitive.Portal.Props): ReactElement {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

/** A control that closes the dialog; `render={<Button variant="outline" />}` makes it a button. */
function DialogClose(props: DialogPrimitive.Close.Props): ReactElement {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

/** The veil over the page behind an open dialog. */
function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props): ReactElement {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn("fixed inset-0 isolate z-50 bg-background/70", className)}
      {...props}
    />
  );
}

/** The dialog's window, in a portal over the veil, with a close button in its corner unless `showCloseButton` is
 * false. `className` may set its width, such as `sm:max-w-lg`. */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & { readonly showCloseButton?: boolean }): ReactElement {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Viewport
        data-slot="dialog-viewport"
        className="fixed inset-0 z-50 flex overflow-y-auto p-4"
      >
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(
            "relative m-auto grid w-full gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 transition duration-100 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 sm:max-w-sm",
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton ? (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={<Button variant="ghost" className="absolute top-2 right-2" size="icon-sm" />}
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPortal>
  );
}

/** The dialog's title and description, stacked at its top. */
function DialogHeader({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div data-slot="dialog-header" className={cn("flex flex-col gap-2", className)} {...props} />
  );
}

/** The dialog's actions, on a muted band across its foot: stacked with the first last on a narrow screen, in a row
 * at the end otherwise. `showCloseButton` adds a Close button. */
function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: ComponentProps<"div"> & { readonly showCloseButton?: boolean }): ReactElement {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <DialogPrimitive.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Close>
      ) : null}
    </div>
  );
}

/** The dialog's title, which names it for assistive technology. */
function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props): ReactElement {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base leading-none font-medium", className)}
      {...props}
    />
  );
}

/** A line under the title, which describes the dialog for assistive technology. */
function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props): ReactElement {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
