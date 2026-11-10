/* InputGroup's addon and button classes, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source) with its arbitrary
 * values replaced by the theme's scales. They live apart from input-group.tsx because a component file exports only
 * components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** Where an addon sits: before or after the input on its line (`inline-start`, `inline-end`), or on a line of its own
 * above or below it (`block-start`, `block-end`). */
const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-disabled [&>kbd]:rounded-sm [&>svg:not([class*='size-'])]:size-(--control-md-icon)",
  {
    variants: {
      align: {
        "inline-start":
          "order-first pl-(--control-md-inset-icon) has-[>button]:-ml-1 has-[>kbd]:-ml-0.5",
        "inline-end":
          "order-last pr-(--control-md-inset-icon) has-[>button]:-mr-1 has-[>kbd]:-mr-0.5",
        "block-start":
          "order-first w-full justify-start px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2",
        "block-end":
          "order-last w-full justify-start px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  },
);

/** An input group's button sizes, which are smaller than Button's so the button fits inside the group's outline. They
 * apply over Button's own classes, so the button keeps Button's variants. Sizes below `h-8` keep the 24 px target in
 * the compact density. */
const inputGroupButtonVariants = cva("flex items-center text-sm shadow-none", {
  variants: {
    size: {
      xs: "h-(--control-xs-height) min-h-target min-w-target gap-(--control-xs-gap) rounded-sm px-(--control-xs-inset-icon) [&>svg:not([class*='size-'])]:size-(--control-sm-icon)",
      sm: "h-(--control-md-height) gap-(--control-md-gap) px-(--control-md-inset) has-data-[icon=inline-end]:pr-(--control-md-inset-icon) has-data-[icon=inline-start]:pl-(--control-md-inset-icon) [&_svg:not([class*='size-'])]:size-(--control-md-icon)",
      "icon-xs":
        "size-(--control-xs-height) min-h-target min-w-target rounded-sm p-0 has-[>svg]:p-0 [&_svg:not([class*='size-'])]:size-(--control-md-icon)",
      "icon-sm":
        "size-(--control-md-height) p-0 has-[>svg]:p-0 [&_svg:not([class*='size-'])]:size-(--control-md-icon)",
    },
  },
  defaultVariants: {
    size: "xs",
  },
});

export { inputGroupAddonVariants, inputGroupButtonVariants };
