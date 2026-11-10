/* Sheet's classes, moved unchanged from sheet.tsx so that the sidebar's sheet below the `md` breakpoint draws on
 * Base UI's dialog with them in the sidebar's colours, which classes on SheetContent could not set past
 * `shadcn/no-restyle`. They live apart from sheet.tsx because a component file exports only components; the package
 * never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** The veil over the page behind a sheet, which appears at once: a full-screen fade would repaint the whole screen
 * every frame on a desktop drawn on the CPU. Only the panel moves. */
const sheetOverlayVariants = cva("fixed inset-0 z-popup bg-overlay");

/** The sheet's panel, against the edge its `data-side` names, sliding a step in from it. */
const sheetContentVariants = cva(
  "fixed z-popup flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-md transition duration-panel ease-in-out outline-none data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-10 data-[side=bottom]:data-starting-style:translate-y-10 data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:-translate-x-10 data-[side=left]:data-starting-style:-translate-x-10 data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-10 data-[side=right]:data-starting-style:translate-x-10 data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:-translate-y-10 data-[side=top]:data-starting-style:-translate-y-10 data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
);

export { sheetContentVariants, sheetOverlayVariants };
