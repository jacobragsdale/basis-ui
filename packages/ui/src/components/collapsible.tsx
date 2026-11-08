/* Collapsible, from shadcn's Base UI source: Base UI's collapsible with its `data-slot`s and no styling, since its
 * trigger and content are whatever the app puts in them. */

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import type { ReactElement } from "react";

/** A section that shows and hides its content. `open` and `onOpenChange` control it, or `defaultOpen` starts it.
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

/** What the collapsible shows when open and hides when closed. */
function CollapsibleContent(props: CollapsiblePrimitive.Panel.Props): ReactElement {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />;
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
