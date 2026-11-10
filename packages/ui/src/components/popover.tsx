/* Popover and its parts, from shadcn's Base UI source (its base-nova style). shadcn animates the popup with
 * tw-animate-css's keyframes, which the theme lacks, sliding it in from its side; here it fades and scales from its
 * anchor through Base UI's `data-starting-style` and `data-ending-style` on a short transition, which the theme's
 * reduced-motion rule stops. */

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

/** shadcn's gap, in pixels, between the popup and its trigger. */
const sideGap = 4;

/** A popover: a panel anchored to its trigger, for a short form or details. Escape and a click outside close it, and
 * focus moves into it and returns to the trigger.
 *
 * @example
 * ```tsx
 * import { Button, Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@basis/ui";
 *
 * <Popover>
 *   <PopoverTrigger render={<Button variant="outline" />}>Columns</PopoverTrigger>
 *   <PopoverContent>
 *     <PopoverHeader>
 *       <PopoverTitle>Columns shown</PopoverTitle>
 *     </PopoverHeader>
 *   </PopoverContent>
 * </Popover>;
 * ```
 */
function Popover(props: PopoverPrimitive.Root.Props): ReactElement {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

/** The control that opens the popover; `render={<Button variant="outline" />}` makes it a button. */
function PopoverTrigger(props: PopoverPrimitive.Trigger.Props): ReactElement {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

/** The panel, in a portal, on the trigger's `side` (`bottom` by default) at `sideOffset` pixels from it. `className`
 * may set its width, such as `w-80`. */
function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = sideGap,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >): ReactElement {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-popup"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-popup flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-edge transition duration-popup outline-hidden data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

/** The popover's title and description, stacked at its top. */
function PopoverHeader({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  );
}

/** The popover's title, which names it for assistive technology. */
function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props): ReactElement {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  );
}

/** The popover's description, under its title. */
function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props): ReactElement {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger };
