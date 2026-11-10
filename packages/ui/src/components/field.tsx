/* Field and its parts, from shadcn's Base UI source in its nova style: a label, a control, a description and an error
 * laid out together, and sets of fields with a legend. They are plain elements, as in shadcn, so they hold any
 * control, and TanStack Form holds the state: a field passes `data-invalid` to `Field`, `aria-invalid` to its control,
 * and its errors to `FieldError`.
 *
 * Changed from shadcn: FieldLabel draws with Label's classes on its own `<label>`, and FieldSeparator draws Base UI's
 * separator, because `shadcn/no-restyle` keeps their colours and borders off a `@basis/ui` component inside the package
 * too; `FieldError` takes the strings `fieldErrors` returns as well as error objects; and the light mode's tints stand
 * for both modes, since the theme's tokens switch with the mode. */

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cn } from "cn";
import type { ComponentProps, ReactElement, ReactNode } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { fieldLegendVariants, fieldVariants } from "./field-variants.ts";
import { labelVariants } from "./label-variants.ts";

/** A `<fieldset>`: a set of fields under one `FieldLegend`, such as a trade's settlement details. */
function FieldSet({ className, ...props }: ComponentProps<"fieldset">): ReactElement {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        "flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        className,
      )}
      {...props}
    />
  );
}

/** A fieldset's `<legend>`. `variant="label"` sizes it as a label, for a set of checkboxes or radios. */
function FieldLegend({
  className,
  variant = "legend",
  ...props
}: ComponentProps<"legend"> & VariantProps<typeof fieldLegendVariants>): ReactElement {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(fieldLegendVariants({ variant }), className)}
      {...props}
    />
  );
}

/** Fields stacked with the form's spacing. A `responsive` field lays its label beside its control once the group is
 * wide enough. */
function FieldGroup({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "group/field-group @container/field-group flex w-full flex-col gap-5 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4",
        className,
      )}
      {...props}
    />
  );
}

/** One field: a label, its control, and the field's description and error. Mark it `data-invalid` while its value is
 * invalid.
 *
 * @example
 * ```tsx
 * import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet, Input } from "@basis/ui";
 *
 * <FieldSet>
 *   <FieldLegend>Ticket</FieldLegend>
 *   <FieldGroup>
 *     <Field>
 *       <FieldLabel htmlFor="cusip">CUSIP</FieldLabel>
 *       <Input id="cusip" aria-describedby="cusip-help" />
 *       <FieldDescription id="cusip-help">Nine characters, check digit last.</FieldDescription>
 *     </Field>
 *   </FieldGroup>
 * </FieldSet>;
 * ```
 */
function Field({
  className,
  orientation = "vertical",
  ...props
}: ComponentProps<"div"> & VariantProps<typeof fieldVariants>): ReactElement {
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- shadcn's markup: a field is one control's group, while a `<fieldset>`, which FieldSet renders, is a set of fields with a legend.
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

/** A horizontal field's label and description, stacked beside its control. */
function FieldContent({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="field-content"
      className={cn("group/field-content flex flex-1 flex-col gap-0.5 leading-snug", className)}
      {...props}
    />
  );
}

/** A field's `<label>`. Wrapping a whole `Field`, it becomes a choice card, tinted while its control is checked. */
function FieldLabel({ className, ...props }: ComponentProps<"label">): ReactElement {
  return (
    // oxlint-disable-next-line jsx-a11y/label-has-associated-control -- the caller associates it, through `htmlFor` or the control it wraps, both in `props`.
    <label
      data-slot="field-label"
      className={cn(
        labelVariants(),
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-disabled has-data-checked:border-primary has-data-checked:bg-selection has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border *:data-[slot=field]:p-2.5 has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-muted has-[>[data-slot=field]]:has-[:focus-visible]:border-ring has-[>[data-slot=field]]:has-[:focus-visible]:outline-solid has-[>[data-slot=field]]:has-[:focus-visible]:outline has-[>[data-slot=field]]:has-[:focus-visible]:outline-offset-(--focus-offset) has-[>[data-slot=field]]:has-[:focus-visible]:outline-ring",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

/** A title in a field's content that is not a `<label>`, such as a choice card's heading. */
function FieldTitle({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-2 text-sm leading-snug font-medium group-data-[disabled=true]/field:opacity-disabled",
        className,
      )}
      {...props}
    />
  );
}

/** A field's or fieldset's help text, in the muted colour. */
function FieldDescription({ className, ...props }: ComponentProps<"p">): ReactElement {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-left text-sm leading-normal font-normal text-muted-foreground group-has-data-[orientation=horizontal]/field:text-balance [[data-variant=legend]+&]:-mt-1.5",
        "last:mt-0 nth-last-2:-mt-1",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

/** A line between groups of fields, with optional text on it, such as "or". */
function FieldSeparator({
  children,
  className,
  ...props
}: ComponentProps<"div"> & { readonly children?: ReactNode }): ReactElement {
  return (
    <div
      data-slot="field-separator"
      data-content={Boolean(children)}
      className={cn(
        "relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2",
        className,
      )}
      {...props}
    >
      <SeparatorPrimitive
        data-slot="separator"
        orientation="horizontal"
        className="absolute inset-0 top-1/2 h-px w-full shrink-0 bg-border"
      />
      {children === undefined ? null : (
        <span
          className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  );
}

/** One error as TanStack Form or a schema reports it, or as text, such as a detail `fieldErrors` returns. */
type FieldErrorEntry = { readonly message?: string | undefined } | string | undefined;

/** An error, or a validator's list of them: TanStack Form types a field's errors as each validator's result, which
 * is a list when a form validator returns several for one field, and flattens them only when it runs. */
type FieldErrors = readonly (FieldErrorEntry | readonly FieldErrorEntry[])[];

/** An error's text, or `undefined` for an entry with none. */
function messageOf(error: FieldErrorEntry): string | undefined {
  return typeof error === "string" ? error : error?.message;
}

/** The field's errors in words, in the destructive colour, announced as they appear. Pass TanStack Form's
 * `field.state.meta.errors` as `errors`, or the field's entry from `fieldErrors`; it shows one error as a line and
 * several as a list, each message once, and nothing while there is no error. Its own `children` replace them. */
function FieldError({
  className,
  children,
  errors,
  ...props
}: ComponentProps<"div"> & {
  readonly errors?: FieldErrors | undefined;
}): ReactElement | null {
  const messages = [
    ...new Set(
      (errors ?? [])
        .flat()
        .map((error) => messageOf(error))
        .filter((message) => message !== undefined && message !== ""),
    ),
  ];
  const [first] = messages;
  let content: ReactNode = children;
  if (children === undefined || children === null) {
    content =
      messages.length > 1 ? (
        <ul className="ml-4 flex list-disc flex-col gap-1">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : (
        first
      );
  }
  if (content === undefined || content === null || content === "") {
    return null;
  }
  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-sm font-normal text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
};
