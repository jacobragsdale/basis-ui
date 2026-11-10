/* Scroll Area and its scrollbar, from Jacob's ui, which matches shadcn's Base UI source: Base UI's scroll area with
 * a thin scrollbar drawn in the theme's border colour. The viewport loses shadcn's `rounded-[inherit]`, since an app
 * cannot round the scroll area, and its arbitrary transition and ring widths become the theme's `transition-shadow`
 * and its focus ring. The scrollbar's classes match Base UI's `data-orientation`, as shadcn's stylesheet variants would. */

import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { cn } from "cn";
import type { ReactElement } from "react";

/** A scrollbar for a `ScrollArea`, vertical by default; `ScrollArea` already holds a vertical one. */
function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props): ReactElement {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:border-t data-[orientation=horizontal]:border-t-transparent data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5 data-[orientation=vertical]:border-l data-[orientation=vertical]:border-l-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-pill bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

/** A region that scrolls its content with a thin scrollbar of the theme's own, vertical by default. Give it a height,
 * such as `h-72`, and it scrolls what overflows. Add a horizontal `ScrollBar` for content wider than it.
 *
 * @use For a region of fixed height that scrolls its content, such as a long list in a popover, with the theme's thin
 * scrollbar. A Table scrolls sideways itself, and parallax's Grid scrolls its own rows.
 * @see Table, Popover, Sheet
 *
 * @example
 * ```tsx
 * import { ScrollArea } from "@basis/ui";
 *
 * <ScrollArea className="h-48">
 *   <p>A long list of trades.</p>
 * </ScrollArea>;
 * ```
 */
function ScrollArea({
  className,
  children,
  ...props
}: ScrollAreaPrimitive.Root.Props): ReactElement {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full transition-shadow outline-none focus-visible:outline-solid focus-visible:outline focus-visible:outline-offset-(--focus-offset) focus-visible:outline-ring"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

export { ScrollArea, ScrollBar };
