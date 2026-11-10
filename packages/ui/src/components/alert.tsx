/* Alert and its parts, from shadcn's Base UI source, with the theme's status variants. Two things differ from shadcn:
 *
 * - The role follows the variant. shadcn gives every alert `role="alert"`, which a screen reader announces at once,
 *   interrupting the user; here only `destructive` and `warning` are alerts, and the rest are `status`, announced
 *   politely. `role` still overrides it.
 * - An AlertTitle names its alert: the title registers its id, and the alert points `aria-labelledby` at it, so a
 *   screen reader and a test find the alert by its title. */

import { cn } from "cn";
import { createContext, use, useId, useLayoutEffect, useState } from "react";
import type { ComponentProps, Dispatch, ReactElement, SetStateAction } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { alertVariants } from "./alert-variants.ts";

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>["variant"]>;

/** Each variant's role: an alert for what needs the user now, a status for the rest. */
const roles: Readonly<Record<AlertVariant, "alert" | "status">> = {
  default: "status",
  success: "status",
  info: "status",
  warning: "alert",
  destructive: "alert",
};

/** How an AlertTitle tells its Alert its id. */
const TitleIdContext = createContext<Dispatch<SetStateAction<string | undefined>> | undefined>(
  undefined,
);

/** A callout: an optional icon first, then an AlertTitle, an AlertDescription and an AlertAction. A status variant
 * pairs its colour with an icon, such as `CircleCheckIcon` for `success`.
 *
 * @use For a message that stays on the page, such as a warning about late data. For an API's error, use ErrorAlert; for
 * a passing message, a toast; for a confirmation, AlertDialog.
 * @see ErrorAlert, toast, AlertDialog, CircleCheckIcon
 *
 * @example
 * ```tsx
 * import { Alert, AlertDescription, AlertTitle } from "@basis/ui";
 *
 * <Alert variant="warning">
 *   <AlertTitle>Prices are stale</AlertTitle>
 *   <AlertDescription>The last price arrived at 09:30.</AlertDescription>
 * </Alert>;
 * ```
 */
function Alert({
  className,
  variant = "default",
  ...props
}: ComponentProps<"div"> & VariantProps<typeof alertVariants>): ReactElement {
  const [titleId, setTitleId] = useState<string>();
  return (
    <TitleIdContext value={setTitleId}>
      <div
        data-slot="alert"
        data-variant={variant}
        role={roles[variant ?? "default"]}
        aria-labelledby={titleId}
        className={cn(alertVariants({ variant }), className)}
        {...props}
      />
    </TitleIdContext>
  );
}

/** The alert's title, which also names it. */
function AlertTitle({ className, id, ...props }: ComponentProps<"div">): ReactElement {
  const generatedId = useId();
  const titleId = id ?? generatedId;
  const setTitleId = use(TitleIdContext);
  useLayoutEffect(() => {
    setTitleId?.(titleId);
    return (): void => {
      setTitleId?.(undefined);
    };
  }, [setTitleId, titleId]);
  return (
    <div
      data-slot="alert-title"
      id={titleId}
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** The alert's text, under its title. */
function AlertDescription({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className,
      )}
      {...props}
    />
  );
}

/** A control in the alert's top right corner, such as a Button that dismisses it. */
function AlertAction({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div data-slot="alert-action" className={cn("absolute top-2 right-2", className)} {...props} />
  );
}

export { Alert, AlertAction, AlertDescription, AlertTitle };
