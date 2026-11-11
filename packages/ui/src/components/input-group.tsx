/* InputGroup and its parts, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source): an input or textarea with text,
 * icons and buttons inside its outline. The group draws the outline, the focus ring and the invalid state, so its input
 * draws none.
 *
 * Changed from shadcn: InputGroupButton is Base UI's button drawn with Button's classes and the group's sizes, and
 * InputGroupInput and InputGroupTextarea draw Input's and Textarea's classes on Base UI's input and a `<textarea>`,
 * because `shadcn/no-restyle` keeps their padding and borders off a `@basis/ui` component inside the package too; the
 * output's classes are shadcn's. The `dark:` classes are gone, and the arbitrary offsets are on the spacing scale. */

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";
import type { ComponentProps, MouseEvent, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { buttonVariants } from "./button-variants.ts";
import { inputGroupAddonVariants, inputGroupButtonVariants } from "./input-group-variants.ts";
import { inputVariants } from "./input-variants.ts";
import { textareaVariants } from "./textarea-variants.ts";

/** An input's outline holding the input and its addons. Name the input itself, with a `<label>` or `aria-label`.
 *
 * @use For an input with an icon, a unit, text or a button inside its outline, such as a search box with its icon. For
 * a plain input, use Input; for controls side by side, ButtonGroup.
 * @see Input, Textarea, Button, Kbd, Spinner, ButtonGroup
 *
 * @example
 * ```tsx
 * import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@basis/ui";
 *
 * <InputGroup>
 *   <InputGroupInput aria-label="Notional" placeholder="0" />
 *   <InputGroupAddon align="inline-end">
 *     <InputGroupText>USD</InputGroupText>
 *   </InputGroupAddon>
 * </InputGroup>;
 * ```
 */
function InputGroup({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="input-group"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- shadcn's markup: the group is one input and its addons, not a `<fieldset>`'s set of fields with a legend.
      role="group"
      className={cn(
        "group/input-group relative flex h-(--control-md-height) w-full min-w-0 items-center rounded-lg border border-input transition-colors outline-none in-data-[slot=combobox-content]:focus-within:border-inherit in-data-[slot=combobox-content]:focus-within:outline-none has-[[data-slot=input-group-control]:disabled]:bg-disabled has-[[data-slot=input-group-control]:disabled]:opacity-disabled has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:outline-solid has-[[data-slot=input-group-control]:focus-visible]:outline has-[[data-slot=input-group-control]:focus-visible]:outline-offset-(--focus-offset) has-[[data-slot=input-group-control]:focus-visible]:outline-ring has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:outline-destructive has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-(--control-xs-inset-icon) has-[>[data-align=inline-start]]:[&>input]:pl-(--control-xs-inset-icon)",
        className,
      )}
      {...props}
    />
  );
}

/** A click on an addon's text or icon focuses the group's input, as a click inside an input's outline would. */
function focusGroupInput(event: MouseEvent<HTMLDivElement>): void {
  if (event.target instanceof Element && event.target.closest("button") !== null) {
    return;
  }
  event.currentTarget.parentElement?.querySelector("input")?.focus();
}

/** Text, an icon or a button inside the group, before or after the input or on a line above or below it. */
function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>): ReactElement {
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the click only moves focus to the group's input, which the keyboard reaches with Tab; the addon is not a control.
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- shadcn's markup: an addon groups text and buttons beside the input, not a `<fieldset>`'s fields.
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={focusGroupInput}
      {...props}
    />
  );
}

/** A button inside the group, such as a search or copy button, in Button's variants at the group's sizes. It is
 * `type="button"` unless told otherwise, so it never submits the form by accident. */
function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<ButtonPrimitive.Props, "type" | "className"> &
  Pick<VariantProps<typeof buttonVariants>, "variant"> &
  VariantProps<typeof inputGroupButtonVariants> & {
    readonly className?: string;
    /** The button's type: `button` by default, so it never submits the form it is in. */
    readonly type?: ComponentProps<"button">["type"];
  }): ReactElement {
  return (
    <ButtonPrimitive
      data-slot="button"
      type={type}
      data-size={size}
      data-variant={variant}
      className={cn(
        buttonVariants({ size: null, variant }),
        inputGroupButtonVariants({ size }),
        className,
      )}
      {...props}
    />
  );
}

/** Text inside the group, such as a unit or a currency, in the muted colour. */
function InputGroupText({ className, ...props }: ComponentProps<"span">): ReactElement {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-(--control-md-icon)",
        className,
      )}
      {...props}
    />
  );
}

/** The group's input: an Input without its own outline. */
function InputGroupInput({ className, ...props }: ComponentProps<"input">): ReactElement {
  return (
    <InputPrimitive
      data-slot="input-group-control"
      className={cn(
        inputVariants(),
        "flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:outline-none disabled:bg-transparent aria-invalid:ring-0",
        className,
      )}
      {...props}
    />
  );
}

/** The group's textarea: a Textarea without its own outline, with addons above or below it. */
function InputGroupTextarea({ className, ...props }: ComponentProps<"textarea">): ReactElement {
  return (
    <textarea
      data-slot="input-group-control"
      className={cn(
        textareaVariants(),
        "flex-1 resize-none rounded-none border-0 bg-transparent py-2 shadow-none ring-0 focus-visible:outline-none disabled:bg-transparent aria-invalid:ring-0",
        className,
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
};
