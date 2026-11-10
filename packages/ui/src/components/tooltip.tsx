/* Tooltip and its parts, from shadcn's Base UI source (its base-nova style), with these changes:
 * - The popup fades and scales from its anchor through Base UI's `data-starting-style` and `data-ending-style` on a
 *   short transition, which the theme's reduced-motion rule stops, in place of tw-animate-css's keyframes, which the
 *   theme lacks; it does not animate at all when it opens at once from a neighbour's (`data-instant`).
 * - The arrow sits by the spacing scale's `0.75` outside the popup's edge, and is rounded with the theme's
 *   `rounded-sm`, where shadcn places it with `calc()` translations and rounds it by an arbitrary 2px. */

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "cn";
import type { ReactElement } from "react";

/** shadcn's gap, in pixels, between the popup and its trigger. */
const sideGap = 4;

/** Shares one delay among the tooltips inside it, so that after one opens its neighbours open at once. shadcn's
 * default delay, 0, is kept. */
function TooltipProvider({ delay = 0, ...props }: TooltipPrimitive.Provider.Props): ReactElement {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />;
}

/** A tooltip: a short label for its trigger, shown while the pointer rests on it or it has keyboard focus. It names
 * nothing for assistive technology, so an icon-only trigger still takes an `aria-label`.
 *
 * @example
 * ```tsx
 * import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@basis/ui";
 *
 * <Tooltip>
 *   <TooltipTrigger render={<Button variant="ghost" size="sm" />}>DV01</TooltipTrigger>
 *   <TooltipContent>Dollar value of a basis point</TooltipContent>
 * </Tooltip>;
 * ```
 */
function Tooltip(props: TooltipPrimitive.Root.Props): ReactElement {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

/** The element the tooltip describes; hovering or focusing it shows the tooltip. */
function TooltipTrigger(props: TooltipPrimitive.Trigger.Props): ReactElement {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

/** The label, in a portal, on the trigger's `side` (`top` by default), with an arrow pointing at the trigger. */
function TooltipContent({
  className,
  side = "top",
  sideOffset = sideGap,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >): ReactElement {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-popup"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-popup inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background transition duration-popup has-data-[slot=kbd]:pr-1.5 data-ending-style:scale-95 data-ending-style:opacity-0 data-instant:transition-none data-starting-style:scale-95 data-starting-style:opacity-0 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-popup **:data-[slot=kbd]:rounded-sm",
            className,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-popup size-2.5 rotate-45 rounded-sm bg-foreground data-[side=bottom]:-top-0.75 data-[side=inline-end]:-left-0.75 data-[side=inline-start]:-right-0.75 data-[side=left]:-right-0.75 data-[side=right]:-left-0.75 data-[side=top]:-bottom-0.75" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
