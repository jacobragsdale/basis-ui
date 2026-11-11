/* Toolbar: Base UI's toolbar, a row of controls that the arrow keys move between as one stop for Tab, such as a grid's
 * or a chart's actions. Its buttons are Button's variants, ghost and small unless set; its groups gather related
 * buttons, and a separator stands between groups. */

import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar";
import { cn } from "cn";
import type { ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { buttonVariants } from "./button-variants.ts";

/** A toolbar: name it with `aria-label`, such as "Positions". The arrow keys move between its controls, and Tab
 * reaches it once.
 *
 * @use For a row of actions over a grid, a chart or an editor. For a few buttons that belong together anywhere, use
 * ButtonGroup; for menus, Menubar.
 * @see ButtonGroup, Menubar, Button, ToggleGroup
 *
 * @example
 * ```tsx
 * import { DownloadIcon, RefreshCwIcon, Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator } from "@basis/ui";
 *
 * <Toolbar aria-label="Positions">
 *   <ToolbarGroup aria-label="Data">
 *     <ToolbarButton>
 *       <RefreshCwIcon data-icon="inline-start" />
 *       Refresh
 *     </ToolbarButton>
 *   </ToolbarGroup>
 *   <ToolbarSeparator />
 *   <ToolbarButton>
 *     <DownloadIcon data-icon="inline-start" />
 *     Export
 *   </ToolbarButton>
 * </Toolbar>;
 * ```
 */
function Toolbar({ className, ...props }: ToolbarPrimitive.Root.Props): ReactElement {
  return (
    <ToolbarPrimitive.Root
      data-slot="toolbar"
      className={cn(
        "flex items-center gap-1 rounded-lg border border-edge bg-background p-1 data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

/** A group of related controls in the toolbar, named with `aria-label`. */
function ToolbarGroup({ className, ...props }: ToolbarPrimitive.Group.Props): ReactElement {
  return (
    <ToolbarPrimitive.Group
      data-slot="toolbar-group"
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  );
}

/** A button in the toolbar, in Button's variants and sizes: ghost and small unless set. */
function ToolbarButton({
  className,
  variant = "ghost",
  size = "sm",
  ...props
}: ToolbarPrimitive.Button.Props & VariantProps<typeof buttonVariants>): ReactElement {
  return (
    <ToolbarPrimitive.Button
      data-slot="toolbar-button"
      className={cn(buttonVariants({ size, variant }), className)}
      {...props}
    />
  );
}

/** A line between groups in the toolbar, across its direction: Base UI marks it vertical in a horizontal toolbar. */
function ToolbarSeparator({ className, ...props }: ToolbarPrimitive.Separator.Props): ReactElement {
  return (
    <ToolbarPrimitive.Separator
      data-slot="toolbar-separator"
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:my-1 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-4 data-[orientation=vertical]:mx-1 data-[orientation=vertical]:h-4 data-[orientation=vertical]:w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator };
