/* InputGroup's addon and button classes, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source) with its arbitrary
 * values replaced by the theme's scales. They live apart from input-group.tsx because a component file exports only
 * components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** Where an addon sits: before or after the input on its line (`inline-start`, `inline-end`), or on a line of its own
 * above or below it (`block-start`, `block-end`). */
const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-sm [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        "inline-start": "order-first pl-2 has-[>button]:-ml-1.25 has-[>kbd]:-ml-0.5",
        "inline-end": "order-last pr-2 has-[>button]:-mr-1.25 has-[>kbd]:-mr-0.5",
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
const inputGroupButtonVariants = cva("flex items-center gap-2 text-sm shadow-none", {
  variants: {
    size: {
      xs: "h-6 min-h-target min-w-target gap-1 rounded-sm px-1.5 [&>svg:not([class*='size-'])]:size-3.5",
      sm: "",
      "icon-xs": "size-6 min-h-target min-w-target rounded-sm p-0 has-[>svg]:p-0",
      "icon-sm": "size-8 p-0 has-[>svg]:p-0",
    },
  },
  defaultVariants: {
    size: "xs",
  },
});

export { inputGroupAddonVariants, inputGroupButtonVariants };
