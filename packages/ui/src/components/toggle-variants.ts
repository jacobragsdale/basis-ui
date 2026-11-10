/* Toggle's classes, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source) with its `dark:` classes and arbitrary
 * values replaced by the theme's tokens and scales. They live apart from toggle.tsx because ToggleGroup's items draw
 * with them too, and a component file exports only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** Toggle's look (`variant`) and height (`size`). A pressed toggle sits on the muted surface. The small size keeps the
 * 24 px target in the compact density. */
const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center rounded-lg text-sm font-medium whitespace-nowrap transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:outline-solid focus-visible:outline focus-visible:outline-offset-(--focus-offset) focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-disabled aria-invalid:border-destructive aria-invalid:outline-destructive aria-pressed:bg-muted [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent hover:bg-muted",
      },
      size: {
        default:
          "h-(--control-md-height) min-w-(--control-md-height) gap-(--control-md-gap) px-(--control-md-inset) has-data-[icon=inline-end]:pr-(--control-md-inset-icon) has-data-[icon=inline-start]:pl-(--control-md-inset-icon) [&_svg:not([class*='size-'])]:size-(--control-md-icon)",
        sm: "h-(--control-sm-height) min-h-target min-w-target gap-(--control-sm-gap) rounded-md px-(--control-sm-inset) text-xs has-data-[icon=inline-end]:pr-(--control-sm-inset-icon) has-data-[icon=inline-start]:pl-(--control-sm-inset-icon) [&_svg:not([class*='size-'])]:size-(--control-sm-icon)",
        lg: "h-(--control-lg-height) min-w-(--control-lg-height) gap-(--control-lg-gap) px-(--control-lg-inset) has-data-[icon=inline-end]:pr-(--control-lg-inset-icon) has-data-[icon=inline-start]:pl-(--control-lg-inset-icon) [&_svg:not([class*='size-'])]:size-(--control-lg-icon)",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export { toggleVariants };
