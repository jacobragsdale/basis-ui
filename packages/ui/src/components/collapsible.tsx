/* Collapsible, from shadcn's Base UI source: Base UI's collapsible with its `data-slot`s, and no styling but the
 * content's motion, since its trigger and content are whatever the app puts in them. The content opens and closes
 * through the height Base UI measures, `--collapsible-panel-height`, on a 150 ms transition, as Base UI's own example
 * does, where shadcn's shows and hides it at once; it clips what overflows it, as the transition needs. */

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { cn } from "cn";
import type { ReactElement } from "react";

/** A section that shows and hides its content. `open` and `onOpenChange` control it, or `defaultOpen` starts it.
 *
 * @use For one section the user shows and hides, such as a filter panel. For several, use Accordion.
 * @see Accordion, Button
 *
 * @example
 * ```tsx
 * import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@basis/ui";
 *
 * <Collapsible>
 *   <CollapsibleTrigger>Show the cash flows</CollapsibleTrigger>
 *   <CollapsibleContent>Coupons on 15 May and 15 November.</CollapsibleContent>
 * </Collapsible>;
 * ```
 */
function Collapsible(props: CollapsiblePrimitive.Root.Props): ReactElement {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

/** The button that opens and closes the content, with `aria-expanded` and `aria-controls` set. Enter and Space
 * toggle it, as on any button. */
function CollapsibleTrigger(props: CollapsiblePrimitive.Trigger.Props): ReactElement {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />;
}

/** What the collapsible shows when open and hides when closed, sliding open and shut. */
function CollapsibleContent({
  className,
  ...props
}: CollapsiblePrimitive.Panel.Props): ReactElement {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className={cn(
        "h-(--collapsible-panel-height) overflow-hidden transition-all duration-panel ease-out data-ending-style:h-0 data-starting-style:h-0",
        className,
      )}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
