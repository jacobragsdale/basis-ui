/* SidebarMenuButton, from shadcn's Base UI source: a menu's button or, through `render`, its link, with an optional
 * Tooltip that names it while the sidebar is folded to its icon rail. The tooltip opens only on the folded rail,
 * through the Tooltip's `disabled`, where shadcn renders its popup and hides it. */

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { useSidebar } from "./sidebar-context.ts";
import { sidebarMenuButtonVariants } from "./sidebar-variants.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx";

type SidebarMenuButtonProps = useRender.ComponentProps<"button"> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    /** Marks the button as the current page's, with `data-active`. */
    readonly isActive?: boolean | undefined;
    /** What names the button on the folded rail: its text, or TooltipContent's props. */
    readonly tooltip?: string | ComponentProps<typeof TooltipContent> | undefined;
  };

/** A menu's button, or its link through `render`, as in `<SidebarMenuButton render={<Link to="/trades" />}>`. */
function SidebarMenuButton({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: SidebarMenuButtonProps): ReactElement {
  const { isMobile, state } = useSidebar();
  const classes = cn(sidebarMenuButtonVariants({ size, variant }), className);
  const button = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">({ className: classes }, props),
    render: tooltip === undefined ? render : <TooltipTrigger render={render} />,
    state: { active: isActive, sidebar: "menu-button", size, slot: "sidebar-menu-button" },
  });
  if (tooltip === undefined) {
    return button;
  }
  const content = typeof tooltip === "string" ? { children: tooltip } : tooltip;
  return (
    <Tooltip disabled={state !== "collapsed" || isMobile}>
      {button}
      <TooltipContent side="right" align="center" {...content} />
    </Tooltip>
  );
}

export { SidebarMenuButton };
