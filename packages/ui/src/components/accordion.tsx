/* Accordion and its parts, from shadcn's Base UI source. shadcn opens a panel with height keyframes from its own
 * stylesheet; here the panel fades in over the theme's short transition instead, since animating height lays the
 * page out again on every frame, which Citrix desktops draw on the CPU, and the theme stops the fade under reduced
 * motion. The chevrons take their size, colour and place from the trigger, as `shadcn/no-restyle` requires, and a
 * disabled trigger dims through `disabled:` as well as shadcn's `aria-disabled:`, since Base UI disables the button. */

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { cn } from "cn";
import type { ReactElement } from "react";

import { ChevronDownIcon } from "#vendor/lucide/chevron-down.tsx";
import { ChevronUpIcon } from "#vendor/lucide/chevron-up.tsx";

/** A stack of sections, each opened by its trigger. One opens at a time unless `multiple` is set. */
function Accordion({ className, ...props }: AccordionPrimitive.Root.Props): ReactElement {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("flex w-full flex-col", className)}
      {...props}
    />
  );
}

/** One section: a trigger and the content it shows, with a line between it and the next. */
function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props): ReactElement {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("not-last:border-b", className)}
      {...props}
    />
  );
}

/** The section's heading: a button, named by its text, that Enter and Space open and close, with a chevron that
 * points down when closed and up when open. Tab moves between the triggers: Base UI 1.9 dropped arrow-key focus
 * between them, as the WAI-ARIA authoring practices did. */
function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props): ReactElement {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:border-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon
          data-slot="accordion-trigger-icon"
          className="group-aria-expanded/accordion-trigger:hidden"
        />
        <ChevronUpIcon
          data-slot="accordion-trigger-icon"
          className="hidden group-aria-expanded/accordion-trigger:inline"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

/** The section's content, a region named by its trigger, which fades in as it opens. */
function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props): ReactElement {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="overflow-hidden text-sm transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0"
      {...props}
    >
      <div
        className={cn(
          "pt-0 pb-2.5 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
          className,
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
