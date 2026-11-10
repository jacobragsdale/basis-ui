/* Hover Card and its parts, from shadcn's Base UI source (its base-nova style), on Base UI's Preview Card. shadcn
 * animates the card with tw-animate-css's keyframes, which the theme lacks; here it fades and scales from its anchor
 * through Base UI's `data-starting-style` and `data-ending-style` on a short transition, which the theme's
 * reduced-motion rule stops. */

import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import { cn } from "cn";
import type { ReactElement } from "react";

/** shadcn's gap, in pixels, between the popup and its trigger. */
const sideGap = 4;
/** shadcn's shift, in pixels, of the card along the trigger from where `align` puts it. */
const alignShift = 4;

/** A hover card: a preview of what a link leads to, shown while the pointer rests on the link or the link has
 * keyboard focus. It is for sighted pointer users; what it shows must also be reachable by following the link.
 *
 * @use For a preview of what a link leads to, such as an issuer's summary on its name. For a short label, use Tooltip;
 * for content a touch or keyboard user must reach, Popover.
 * @see Tooltip, Popover, Avatar
 *
 * @example
 * ```tsx
 * import { HoverCard, HoverCardContent, HoverCardTrigger } from "@basis/ui";
 *
 * <HoverCard>
 *   <HoverCardTrigger href="/bonds/US91282CRF04">US91282CRF04</HoverCardTrigger>
 *   <HoverCardContent>Treasury 4.125% 2036</HoverCardContent>
 * </HoverCard>;
 * ```
 */
function HoverCard(props: PreviewCardPrimitive.Root.Props): ReactElement {
  return <PreviewCardPrimitive.Root data-slot="hover-card" {...props} />;
}

/** The link the card previews: an `<a>`, which takes `href`. */
function HoverCardTrigger(props: PreviewCardPrimitive.Trigger.Props): ReactElement {
  return <PreviewCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />;
}

/** The card, in a portal, on the trigger's `side` (`bottom` by default). `className` may set its width. */
function HoverCardContent({
  className,
  side = "bottom",
  sideOffset = sideGap,
  align = "center",
  alignOffset = alignShift,
  ...props
}: PreviewCardPrimitive.Popup.Props &
  Pick<
    PreviewCardPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >): ReactElement {
  return (
    <PreviewCardPrimitive.Portal data-slot="hover-card-portal">
      <PreviewCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-popup"
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            "z-popup w-64 origin-(--transform-origin) rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-edge transition duration-popup outline-hidden data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
