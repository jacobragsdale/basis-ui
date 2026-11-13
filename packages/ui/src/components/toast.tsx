/* Toast and its parts, from shadcn's Toast for Base UI (July 2026), on Base UI's own `@base-ui/react/toast` rather
 * than Sonner. An app renders `<Toaster />` once, around or beside its routes, and raises a toast from anywhere with
 * `toast.add({ title, description, type })`, from toast-manager.ts. It differs from shadcn in three ways:
 *
 * - The toasts sit in a column rather than a fanned deck, as toast-variants.ts says.
 * - A toast's `type` also sets its colours: `success`, `warning`, `info` and `destructive` are the theme's status
 *   variants, and `error`, which Base UI's `toast.promise` sets on a rejection, draws as `destructive`.
 * - The close button has no enlarged hit area, which took an arbitrary `content-['']`: it is Button's `icon-sm`, which
 *   already keeps WCAG 2.2's 24 px target in the compact density.
 *
 * Base UI does the rest: the viewport is a polite live region named "Notifications", F6 moves focus into it, hovering
 * or focusing it pauses the timers, and Escape closes the focused toast. */

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { cn } from "cn";
import type { ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";
import { CircleCheckIcon } from "#vendor/lucide/circle-check.tsx";
import { InfoIcon } from "#vendor/lucide/info.tsx";
import { LoaderCircleIcon } from "#vendor/lucide/loader-circle.tsx";
import { OctagonXIcon } from "#vendor/lucide/octagon-x.tsx";
import { TriangleExclamationPointIcon } from "#vendor/lucide/triangle-exclamation-point.tsx";
import { XIcon } from "#vendor/lucide/x.tsx";

import { Button } from "./button.tsx";
import { toast } from "./toast-manager.ts";
import { toastVariants } from "./toast-variants.ts";

type ToastVariant = NonNullable<VariantProps<typeof toastVariants>["variant"]>;

/** The look for each toast `type` that has one of its own; any other type is the plain toast. */
const variantsByType = new Map<string | undefined, ToastVariant>([
  ["success", "success"],
  ["warning", "warning"],
  ["info", "info"],
  ["destructive", "destructive"],
  ["error", "destructive"],
]);

function variantOf(type: string | undefined): ToastVariant {
  return variantsByType.get(type) ?? "default";
}

/* The Buttons the action and the close button render as, made once rather than as default props, which would make a
 * new element on every render. */
const actionButton = <Button variant="outline" size="sm" />;
const closeButton = <Button variant="ghost" size="icon-sm" />;

/** The provider every toast part needs. `<Toaster />` includes one; use this to build a list of your own. */
function ToastProvider(props: ToastPrimitive.Provider.Props): ReactElement {
  return <ToastPrimitive.Provider {...props} />;
}

/** Renders the toasts into the page's body. `Toaster` includes one. */
function ToastPortal(props: ToastPrimitive.Portal.Props): ReactElement {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

/** Where the toasts appear: the bottom right corner, or across the bottom on a narrow screen, over every popup and
 * dialog's veil, so a toast raised while a dialog is open is read and clicked. */
function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props): ReactElement {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "pointer-events-none fixed inset-x-4 bottom-4 z-notice mx-auto flex w-auto max-w-sm flex-col gap-2 outline-none sm:right-4 sm:left-auto sm:mx-0 sm:w-full",
        className,
      )}
      {...props}
    />
  );
}

/** One toast, drawn in the look its `type` picks. */
function Toast({
  className,
  toast: toastObject,
  ...props
}: ToastPrimitive.Root.Props): ReactElement {
  const variant = variantOf(toastObject.type);
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      data-variant={variant}
      toast={toastObject}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
}

/** A toast's text and action, inside the toast. */
function ToastContent({ className, ...props }: ToastPrimitive.Content.Props): ReactElement {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn("flex items-center gap-3 overflow-hidden p-4", className)}
      {...props}
    />
  );
}

/** The toast's title, which also names it. It shows the toast's `title` unless given children. */
function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props): ReactElement {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  );
}

/** A toast's text, under its title. */
function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props): ReactElement {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/** The toast's action, a small outline Button, shown when the toast has `actionProps`, as in
 * `toast.add({ title: "Order cancelled", actionProps: { children: "Undo", onClick: restore } })`. */
function ToastAction({
  className,
  render = actionButton,
  ...props
}: ToastPrimitive.Action.Props): ReactElement {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}

/** A ghost icon Button, named "Close notification", that closes the toast. */
function ToastClose({
  className,
  children,
  render = closeButton,
  ...props
}: ToastPrimitive.Close.Props): ReactElement {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label="Close notification"
      render={render}
      className={cn("shrink-0", className)}
      {...props}
    >
      {children ?? <XIcon />}
    </ToastPrimitive.Close>
  );
}

const statusIcons = {
  success: CircleCheckIcon,
  warning: TriangleExclamationPointIcon,
  info: InfoIcon,
  destructive: OctagonXIcon,
} as const;

/** The icon for a toast's type, in the toast's text colour: the status's icon, or a turning loader for `loading`. */
function ToastIcon({ type }: { readonly type: string | undefined }): ReactElement | null {
  const variant = variantOf(type);
  if (type === "loading") {
    return (
      <span
        data-slot="toast-icon"
        className="shrink-0 [&_svg]:pointer-events-none [&_svg]:animate-spin motion-reduce:[&_svg]:animate-none [&_svg:not([class*='size-'])]:size-(--control-md-icon)"
      >
        <LoaderCircleIcon />
      </span>
    );
  }
  if (variant === "default") {
    return null;
  }
  const Icon = statusIcons[variant];
  return (
    <span
      data-slot="toast-icon"
      className="shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-(--control-md-icon)"
    >
      <Icon />
    </span>
  );
}

/** Every toast in the provider, newest first, each with its icon, title, description, action and close button. */
function ToastList(): ReactElement[] {
  const { toasts } = ToastPrimitive.useToastManager();
  return toasts.map((toastObject) => (
    <Toast key={toastObject.id} toast={toastObject}>
      <ToastContent>
        <ToastIcon type={toastObject.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  ));
}

/** The provider and the viewport, with every toast the manager raises: the app's `toast` unless `toastManager` names
 * another. Render it once, around the app or beside it. `limit` (3 by default) caps how many show at once, and
 * `timeout` (5000 ms) how long each stays.
 *
 * @use Render it once, as BasisApp does, and raise a toast with `toast` for a passing message, such as "Trade booked".
 * For a message that stays, use Alert; for a query's error on the page, ErrorAlert.
 * @see toast, toastError, BasisApp, Alert
 *
 * @example
 * ```tsx
 * import { Button, Toaster, toast } from "@basis/ui";
 *
 * <>
 *   <Toaster />
 *   <Button
 *     onClick={() => {
 *       toast.add({ description: "Bought 5,000 par at 99-16.", title: "Trade booked", type: "success" });
 *     }}
 *   >
 *     Book
 *   </Button>
 * </>;
 * ```
 */
function Toaster({
  children,
  toastManager = toast,
  ...props
}: ToastPrimitive.Provider.Props): ReactElement {
  return (
    <ToastProvider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}

export {
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  Toaster,
};
