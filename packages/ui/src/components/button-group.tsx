/* ButtonGroup and its parts, from shadcn's Base UI source in its nova style: buttons, inputs and selects joined into
 * one control, with text and separators between them.
 *
 * Changed from shadcn: ButtonGroupSeparator draws Base UI's separator itself rather than shadcn's Separator, since
 * `shadcn/no-restyle` keeps its colour off a `@basis/ui` component inside the package too. */

import { mergeProps } from "@base-ui/react/merge-props";
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { buttonGroupVariants } from "./button-group-variants.ts";

/** A group of buttons, inputs or selects drawn as one control. Name it with `aria-label` when its purpose is not plain
 * from its buttons. Groups nest, with a gap between them.
 *
 * @use For buttons, inputs or selects that act together and read as one control, such as a split button or a pager. For
 * options of which one or several are on, use ToggleGroup.
 * @see Button, ButtonLink, Input, InputGroup, Select, ToggleGroup
 *
 * @example
 * ```tsx
 * import { Button, ButtonGroup, ButtonGroupSeparator } from "@basis/ui";
 *
 * <ButtonGroup aria-label="Order side">
 *   <Button variant="outline">Buy</Button>
 *   <ButtonGroupSeparator />
 *   <Button variant="outline">Sell</Button>
 * </ButtonGroup>;
 * ```
 */
function ButtonGroup({
  className,
  orientation = "horizontal",
  ...props
}: ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>): ReactElement {
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- shadcn's markup: a `<fieldset>` would disable its buttons with it and draw as a form section, which a toolbar of buttons is not.
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

/** Text inside a button group, such as a unit or a prefix, on the muted surface. `render` makes it another element,
 * such as a `<label>` for the group's input. */
function ButtonGroupText({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): ReactElement {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex items-center gap-2 rounded-lg border bg-muted px-2.5 text-sm font-medium [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-(--control-md-icon)",
          className,
        ),
      },
      props,
    ),
    render,
    state: { slot: "button-group-text" },
  });
}

/** A line between a group's buttons, for groups whose buttons have no border of their own. */
function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: SeparatorPrimitive.Props & { readonly className?: string }): ReactElement {
  return (
    <SeparatorPrimitive
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn(
        "relative shrink-0 self-stretch bg-input data-[orientation=horizontal]:mx-px data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-auto data-[orientation=vertical]:my-px data-[orientation=vertical]:h-auto data-[orientation=vertical]:w-px",
        className,
      )}
      {...props}
    />
  );
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText };
