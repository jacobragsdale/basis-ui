/* Toggle's classes, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source) with its `dark:` classes and arbitrary
 * values replaced by the theme's tokens and scales. They live apart from toggle.tsx because ToggleGroup's items draw
 * with them too, and a component file exports only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** Toggle's look (`variant`) and height (`size`). A pressed toggle sits on the muted surface. The small size keeps the
 * 24 px target in the compact density. */
const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:outline-solid focus-visible:outline focus-visible:outline-offset-(--focus-offset) focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-disabled aria-invalid:border-destructive aria-invalid:outline-destructive aria-pressed:bg-muted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent hover:bg-muted",
      },
      size: {
        default:
          "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-7 min-h-target min-w-target rounded-md px-2.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export { toggleVariants };
