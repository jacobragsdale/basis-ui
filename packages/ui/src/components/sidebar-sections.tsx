/* Sidebar's sections, from shadcn's Base UI source: its header, footer, separator, input and the content between
 * them. The separator and the input draw on Base UI's separator and input with Separator's and Input's classes, since
 * shadcn's colour and background classes on @basis/ui's own Separator and Input would fail `no-restyle`. The content
 * keeps its scrollbar, which shadcn hides with a utility from its own stylesheet. */

import { Input as InputPrimitive } from "@base-ui/react/input";
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import { inputVariants } from "./input-variants.ts";
import { separatorVariants } from "./separator-variants.ts";

/** A search or filter field in the sidebar, with the Input's look on the page's background. */
function SidebarInput({ className, ...props }: ComponentProps<"input">): ReactElement {
  return (
    <InputPrimitive
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn(inputVariants(), "bg-background shadow-none", className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

/** A line between the sidebar's sections, in the sidebar's border colour. */
function SidebarSeparator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props): ReactElement {
  return (
    <SeparatorPrimitive
      data-slot="sidebar-separator"
      data-sidebar="separator"
      orientation={orientation}
      className={cn(
        separatorVariants(),
        "mx-2 bg-sidebar-border data-[orientation=horizontal]:w-auto",
        className,
      )}
      {...props}
    />
  );
}

/** The sidebar's scrolling middle, between its header and footer. */
function SidebarContent({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

export { SidebarContent, SidebarFooter, SidebarHeader, SidebarInput, SidebarSeparator };
