/* Alert Dialog and its parts, from shadcn's Base UI source (its base-nova style), with Dialog's changes: the backdrop
 * veils the page in the theme's background with no blur and no fade, the popup fades and scales through Base UI's
 * `data-starting-style` and `data-ending-style`, it sits in Base UI's viewport, and the title drops `font-heading`.
 * Two more:
 * - shadcn lays the header out on arbitrary grid templates so that, at the default size on a wide screen, the media
 *   sits beside the title. Here the header is a column on the theme's scales, and the media sits above the title.
 * - AlertDialogAction and AlertDialogCancel take Button's `variant` and `size` and draw with its classes, imported under
 *   their own names so that `shadcn/no-restyle`'s errors on them list Button's variants and sizes. */

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import {
  buttonVariants as alertDialogActionVariants,
  buttonVariants as alertDialogCancelVariants,
} from "./button-variants.ts";

/** An alert dialog: a dialog that asks the user to confirm or cancel an action. Unlike Dialog, a click outside does
 * not close it; Escape and its cancel button do, and focus returns to the trigger.
 *
 * @use For confirming an action that cannot be undone, such as cancelling an order, which the user must answer before
 * going on. For a form or details, use Dialog.
 * @see Dialog, Button
 *
 * @example
 * ```tsx
 * import {
 *   AlertDialog,
 *   AlertDialogAction,
 *   AlertDialogCancel,
 *   AlertDialogContent,
 *   AlertDialogDescription,
 *   AlertDialogFooter,
 *   AlertDialogHeader,
 *   AlertDialogTitle,
 *   AlertDialogTrigger,
 *   Button,
 * } from "@basis/ui";
 * import { useState } from "react";
 *
 * // The action does not close the dialog by itself: hold `open`, and close it once the action has run.
 * const [open, setOpen] = useState(false);
 *
 * <AlertDialog open={open} onOpenChange={setOpen}>
 *   <AlertDialogTrigger render={<Button variant="destructive" />}>Cancel order</AlertDialogTrigger>
 *   <AlertDialogContent>
 *     <AlertDialogHeader>
 *       <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
 *       <AlertDialogDescription>The order leaves the book and cannot be restored.</AlertDialogDescription>
 *     </AlertDialogHeader>
 *     <AlertDialogFooter>
 *       <AlertDialogCancel>Keep it</AlertDialogCancel>
 *       <AlertDialogAction onClick={() => { setOpen(false); }}>Cancel order</AlertDialogAction>
 *     </AlertDialogFooter>
 *   </AlertDialogContent>
 * </AlertDialog>;
 * ```
 */
function AlertDialog(props: AlertDialogPrimitive.Root.Props): ReactElement {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

/** The control that opens the alert dialog; `render={<Button variant="destructive" />}` makes it a button. */
function AlertDialogTrigger(props: AlertDialogPrimitive.Trigger.Props): ReactElement {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

/** Renders the alert dialog's popup into the page's body, outside the trigger's layout. `AlertDialogContent`
 * includes one. */
function AlertDialogPortal(props: AlertDialogPrimitive.Portal.Props): ReactElement {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

/** The veil over the page behind an open alert dialog. */
function AlertDialogOverlay({
  className,
  ...props
}: AlertDialogPrimitive.Backdrop.Props): ReactElement {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn("fixed inset-0 isolate z-popup bg-overlay", className)}
      {...props}
    />
  );
}

/** The alert dialog's window, in a portal over the veil. `size="sm"` makes it narrow, with its text centred and its
 * two actions side by side. */
function AlertDialogContent({
  className,
  size = "default",
  ...props
}: AlertDialogPrimitive.Popup.Props & {
  /** How wide the window is; the small one centres its text and sets its two actions side by side. */
  readonly size?: "default" | "sm";
}): ReactElement {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Viewport
        data-slot="alert-dialog-viewport"
        className="fixed inset-0 z-popup flex overflow-y-auto p-4"
      >
        <AlertDialogPrimitive.Popup
          data-slot="alert-dialog-content"
          data-size={size}
          className={cn(
            "group/alert-dialog-content relative m-auto grid w-full gap-4 rounded-xl bg-popover p-4 text-popover-foreground shadow-md ring-1 ring-edge transition duration-popup outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm",
            className,
          )}
          {...props}
        />
      </AlertDialogPrimitive.Viewport>
    </AlertDialogPortal>
  );
}

/** The media, title and description: centred, and at the start at the default size on a wide screen. */
function AlertDialogHeader({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "flex flex-col items-center gap-1.5 text-center sm:group-data-[size=default]/alert-dialog-content:items-start sm:group-data-[size=default]/alert-dialog-content:text-left",
        className,
      )}
      {...props}
    />
  );
}

/** The actions, on a muted band across the dialog's foot: in a row at the end, or two equal columns when small. */
function AlertDialogFooter({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

/** An icon above the title, on a tile; it sizes the icon inside it. The tile is `secondary`, where shadcn's is `muted`,
 * which in this theme's dark mode is the popover's own colour. */
function AlertDialogMedia({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-10 items-center justify-center rounded-md bg-secondary *:[svg:not([class*='size-'])]:size-6",
        className,
      )}
      {...props}
    />
  );
}

/** The alert dialog's title, which names it for assistive technology. */
function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props): ReactElement {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-base font-medium", className)}
      {...props}
    />
  );
}

/** What the action does and what it cannot undo, which describes the dialog for assistive technology. */
function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props): ReactElement {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** The action the dialog confirms: a button drawn as a Button, which does not close the dialog by itself, so its
 * handler closes it once the action has run. */
function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof alertDialogActionVariants>): ReactElement {
  return (
    <ButtonPrimitive
      data-slot="alert-dialog-action"
      data-variant={variant}
      data-size={size}
      className={cn(alertDialogActionVariants({ size, variant }), className)}
      {...props}
    />
  );
}

/** The button that closes the dialog without acting, drawn as an outline Button unless `variant` says otherwise. */
function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: AlertDialogPrimitive.Close.Props &
  VariantProps<typeof alertDialogCancelVariants>): ReactElement {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      data-variant={variant}
      data-size={size}
      className={cn(alertDialogCancelVariants({ size, variant }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
